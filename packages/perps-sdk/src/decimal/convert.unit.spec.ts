import { DECIMAL_PATTERN, PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { PerpsError } from '../errors/PerpsError.js'
import {
  baseUnitsToDecimal,
  decimalToBaseUnits,
  fromBaseUnits,
  fromBaseUnitsNumber,
  scaleToInteger,
} from './convert.js'

const expectValidationError = (fn: () => unknown, match: RegExp) => {
  expect(fn).toThrowError(match)
  try {
    fn()
    expect.unreachable('expected fn to throw')
  } catch (e) {
    if (!(e instanceof PerpsError)) {
      throw e
    }
    expect(e.code).toBe(PerpsErrorCode.ValidationError)
  }
}

describe('deprecated aliases', () => {
  it.each([
    [scaleToInteger, decimalToBaseUnits],
    [fromBaseUnits, baseUnitsToDecimal],
  ])('alias %# forwards to the renamed implementation', (alias, renamed) => {
    expect(alias).toBe(renamed)
  })
})

describe('decimalToBaseUnits', () => {
  it('scales on-grid values exactly under both roundings', () => {
    // 0.29 * 100 === 28.999999999999996 in binary floats; exact decimal
    // arithmetic must yield 29 regardless of rounding.
    expect(decimalToBaseUnits('0.29', 2, 'truncate')).toBe(29)
    expect(decimalToBaseUnits('0.29', 2, 'round')).toBe(29)
    expect(decimalToBaseUnits('8.2', 1, 'truncate')).toBe(82)
    expect(decimalToBaseUnits('1.5', 2, 'round')).toBe(150)
    expect(decimalToBaseUnits('0.001', 6, 'truncate')).toBe(1000)
    expect(decimalToBaseUnits('61729.6', 1, 'round')).toBe(617296)
    expect(decimalToBaseUnits('45000', 0, 'truncate')).toBe(45000)
  })

  it('truncates off-grid values toward zero on both sides of the step', () => {
    expect(decimalToBaseUnits('0.294', 2, 'truncate')).toBe(29)
    expect(decimalToBaseUnits('0.296', 2, 'truncate')).toBe(29)
    expect(decimalToBaseUnits('0.299999', 2, 'truncate')).toBe(29)
    expect(decimalToBaseUnits('-0.296', 2, 'truncate')).toBe(-29)
  })

  it('rounds off-grid values to the nearest grid point on both sides of the step', () => {
    expect(decimalToBaseUnits('0.294', 2, 'round')).toBe(29)
    expect(decimalToBaseUnits('0.296', 2, 'round')).toBe(30)
    expect(decimalToBaseUnits('0.295', 2, 'round')).toBe(30)
    expect(decimalToBaseUnits('-0.296', 2, 'round')).toBe(-30)
  })

  it('handles large magnitudes exactly up to Number.MAX_SAFE_INTEGER', () => {
    expect(decimalToBaseUnits('4500000000.123456', 6, 'truncate')).toBe(
      4500000000123456
    )
    expect(decimalToBaseUnits('9007199254740.991', 3, 'truncate')).toBe(
      Number.MAX_SAFE_INTEGER
    )
  })

  it('rejects scaled results beyond Number.MAX_SAFE_INTEGER', () => {
    expectValidationError(
      () => decimalToBaseUnits('9007199254740.992', 3, 'truncate'),
      /MAX_SAFE_INTEGER/
    )
  })

  it('rejects non-numeric input loudly', () => {
    expectValidationError(
      () => decimalToBaseUnits('abc', 2, 'truncate'),
      /Invalid decimal string for integer scaling/
    )
    expectValidationError(
      () => decimalToBaseUnits('', 2, 'round'),
      /Invalid decimal string for integer scaling/
    )
  })

  it('rejects invalid decimals', () => {
    expectValidationError(
      () => decimalToBaseUnits('1', -1, 'truncate'),
      /Invalid decimals for integer scaling/
    )
    expectValidationError(
      () => decimalToBaseUnits('1', 1.5, 'round'),
      /Invalid decimals for integer scaling/
    )
  })
})

describe('baseUnitsToDecimal', () => {
  it('should convert USDC base units (6 decimals)', () => {
    expect(baseUnitsToDecimal('1000000', 6)).toBe('1')
  })

  it('should convert ETH base units (18 decimals)', () => {
    expect(baseUnitsToDecimal('1000000000000000000', 18)).toBe('1')
  })

  it('should handle fractional values', () => {
    expect(baseUnitsToDecimal('500000', 6)).toBe('0.5')
  })

  it('should return 0 for invalid input', () => {
    expect(baseUnitsToDecimal('not-a-number', 6)).toBe('0')
  })

  it.each([
    ['1000000', 6],
    ['1000000000000000000', 18],
    ['500000', 6],
    ['-500000', 6],
    ['1234500000', 6],
    ['0', 6],
    ['not-a-number', 6],
  ] as const)('spells %s at %i decimals as a DecimalString', (amount, dp) => {
    expect(baseUnitsToDecimal(amount, dp)).toMatch(DECIMAL_PATTERN)
  })

  it('round-trips through decimalToBaseUnits', () => {
    expect(
      decimalToBaseUnits(baseUnitsToDecimal('1234500', 6), 6, 'truncate')
    ).toBe(1234500)
  })
})

describe('fromBaseUnitsNumber', () => {
  it('should return a number', () => {
    expect(fromBaseUnitsNumber('1000000', 6)).toBe(1)
  })

  it('should return 0 for invalid input', () => {
    expect(fromBaseUnitsNumber('bad', 6)).toBe(0)
  })
})
