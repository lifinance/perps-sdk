import { DECIMAL_PATTERN, PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { PerpsError } from '../errors/PerpsError.js'
import {
  baseUnitsToDecimal,
  decimalToBaseUnits,
  numberToDecimalString,
  truncateDecimal,
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

  it.each([
    'abc',
    '',
    '1e-8',
    '1E7',
  ])('rejects the non-decimal string %j, naming the function and the value', (value) => {
    expectValidationError(
      () => decimalToBaseUnits(value, 8, 'truncate'),
      new RegExp(`decimalToBaseUnits\\(value\\).*'${value}'`)
    )
  })

  it('scales the smallest plain decimal an exponent string would spell', () => {
    expect(decimalToBaseUnits('0.00000001', 8, 'truncate')).toBe(1)
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

describe('truncateDecimal', () => {
  it.each([
    ['500', 2, '500.00'],
    ['1000.999', 2, '1000.99'],
    ['0.0000006', 8, '0.00000060'],
    ['-1.239', 2, '-1.23'],
    ['7', 2, '7.00'],
    ['0.1', 2, '0.10'],
  ] as const)('pads %s at %i decimals to %s', (value, dp, expected) => {
    expect(truncateDecimal(value, dp)).toBe(expected)
  })

  it('pads past the float grid, where toFixed on a number cannot', () => {
    expect(truncateDecimal('0.01', 18)).toBe('0.010000000000000000')
  })

  it('truncates magnitudes beyond Number.MAX_SAFE_INTEGER exactly', () => {
    expect(truncateDecimal('9007199254740993.129', 2)).toBe(
      '9007199254740993.12'
    )
  })

  it('keeps the smallest step of its own grid', () => {
    expect(truncateDecimal('0.00000001', 8)).toBe('0.00000001')
  })

  it('drops the sign when the truncation lands on zero', () => {
    expect(truncateDecimal('-0.001', 2)).toBe('0.00')
    expect(truncateDecimal('-0', 2)).toBe('0.00')
  })

  it('emits no decimal point at zero decimals', () => {
    expect(truncateDecimal('1000.999', 0)).toBe('1000')
  })

  it.each([
    ['500', 2],
    ['1000.999', 2],
    ['-1.239', 2],
    ['-0.001', 2],
    ['0.0000006', 8],
    ['1000.999', 0],
  ] as const)('spells %s at %i decimals as a DecimalString', (value, dp) => {
    expect(truncateDecimal(value, dp)).toMatch(DECIMAL_PATTERN)
  })

  it.each([
    '',
    'abc',
    '1.2.3',
    '0x10',
    '1e-8',
    '1.5e21',
  ])('rejects the non-decimal string %j, naming the function and the value', (value) => {
    expectValidationError(
      () => truncateDecimal(value, 8),
      new RegExp(`truncateDecimal\\(value\\).*'${value}'`)
    )
  })

  it.each([-1, 1.5, Number.NaN])('rejects the decimals %j', (dp) => {
    expectValidationError(
      () => truncateDecimal('1', dp),
      /Invalid decimals for truncation/
    )
  })
})

describe('numberToDecimalString', () => {
  it.each([
    [1e-7, '0.0000001'],
    [1e-8, '0.00000001'],
    [5e-7, '0.0000005'],
    [-0, '0'],
    [0, '0'],
    [123456789.123, '123456789.123'],
    [1.5e21, '1500000000000000000000'],
    [-2.5, '-2.5'],
  ] as const)('spells %j as %s', (value, expected) => {
    expect(numberToDecimalString(value)).toBe(expected)
  })

  it('keeps the float artifact a number already carries', () => {
    expect(numberToDecimalString(0.1 + 0.2)).toBe('0.30000000000000004')
  })

  it.each([
    1e-7, 5e-7, -0, 123456789.123, 1.5e21, -2.5,
  ])('spells %j as a DecimalString', (value) => {
    expect(numberToDecimalString(value)).toMatch(DECIMAL_PATTERN)
  })

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects the non-finite number %j', (value) => {
    expectValidationError(
      () => numberToDecimalString(value),
      /Invalid number for decimal conversion/
    )
  })
})
