import { DECIMAL_PATTERN, PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PerpsError } from '../errors/PerpsError.js'
import {
  decimalStringToScaledInteger,
  numberToDecimalString,
  roundDecimalString,
  safeDecimalStringToScaledInteger,
  safeNumberToDecimalString,
  safeRoundDecimalString,
  safeScaledIntegerToDecimalString,
  safeTruncateDecimal,
  scaledIntegerToDecimalString,
  truncateDecimal,
} from './convert.js'

afterEach(() => {
  vi.restoreAllMocks()
})

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

describe('decimalStringToScaledInteger', () => {
  it('scales on-grid values exactly under both roundings', () => {
    // 0.29 * 100 === 28.999999999999996 in binary floats; exact decimal
    // arithmetic must yield 29 regardless of rounding.
    expect(decimalStringToScaledInteger('0.29', 2, 'truncate')).toBe(29)
    expect(decimalStringToScaledInteger('0.29', 2, 'round')).toBe(29)
    expect(decimalStringToScaledInteger('8.2', 1, 'truncate')).toBe(82)
    expect(decimalStringToScaledInteger('1.5', 2, 'round')).toBe(150)
    expect(decimalStringToScaledInteger('0.001', 6, 'truncate')).toBe(1000)
    expect(decimalStringToScaledInteger('61729.6', 1, 'round')).toBe(617296)
    expect(decimalStringToScaledInteger('45000', 0, 'truncate')).toBe(45000)
  })

  it('truncates off-grid values toward zero on both sides of the step', () => {
    expect(decimalStringToScaledInteger('0.294', 2, 'truncate')).toBe(29)
    expect(decimalStringToScaledInteger('0.296', 2, 'truncate')).toBe(29)
    expect(decimalStringToScaledInteger('0.299999', 2, 'truncate')).toBe(29)
    expect(decimalStringToScaledInteger('-0.296', 2, 'truncate')).toBe(-29)
  })

  it('rounds off-grid values to the nearest grid point on both sides of the step', () => {
    expect(decimalStringToScaledInteger('0.294', 2, 'round')).toBe(29)
    expect(decimalStringToScaledInteger('0.296', 2, 'round')).toBe(30)
    expect(decimalStringToScaledInteger('0.295', 2, 'round')).toBe(30)
    expect(decimalStringToScaledInteger('-0.296', 2, 'round')).toBe(-30)
  })

  it('rounds off-grid values away from zero under up', () => {
    expect(decimalStringToScaledInteger('0.291', 2, 'up')).toBe(30)
    expect(decimalStringToScaledInteger('0.29', 2, 'up')).toBe(29)
    expect(decimalStringToScaledInteger('-0.291', 2, 'up')).toBe(-30)
  })

  it('handles large magnitudes exactly up to Number.MAX_SAFE_INTEGER', () => {
    expect(
      decimalStringToScaledInteger('4500000000.123456', 6, 'truncate')
    ).toBe(4500000000123456)
    expect(
      decimalStringToScaledInteger('9007199254740.991', 3, 'truncate')
    ).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('rejects scaled results beyond Number.MAX_SAFE_INTEGER', () => {
    expectValidationError(
      () => decimalStringToScaledInteger('9007199254740.992', 3, 'truncate'),
      /MAX_SAFE_INTEGER/
    )
  })

  it.each([
    'abc',
    '',
    '1e-8',
    '1E7',
    '$1',
    '1,000',
  ])('rejects the non-decimal string %j, naming the value', (value) => {
    expectValidationError(
      () => decimalStringToScaledInteger(value, 8, 'truncate'),
      new RegExp(`'${value.replace('$', '\\$')}' is not a decimal string`)
    )
  })

  it('scales the smallest plain decimal an exponent string would spell', () => {
    expect(decimalStringToScaledInteger('0.00000001', 8, 'truncate')).toBe(1)
  })

  it('rejects invalid decimals', () => {
    expectValidationError(
      () => decimalStringToScaledInteger('1', -1, 'truncate'),
      /Invalid decimals for integer scaling/
    )
    expectValidationError(
      () => decimalStringToScaledInteger('1', 1.5, 'round'),
      /Invalid decimals for integer scaling/
    )
  })
})

describe('scaledIntegerToDecimalString', () => {
  it('should convert USDC base units (6 decimals)', () => {
    expect(scaledIntegerToDecimalString('1000000', 6)).toBe('1')
  })

  it('should convert ETH base units (18 decimals)', () => {
    expect(scaledIntegerToDecimalString('1000000000000000000', 18)).toBe('1')
  })

  it('should handle fractional values', () => {
    expect(scaledIntegerToDecimalString('500000', 6)).toBe('0.5')
  })

  it('converts a 30-digit integer exactly', () => {
    expect(
      scaledIntegerToDecimalString('123456789012345678901234567890', 18)
    ).toBe('123456789012.34567890123456789')
  })

  it.each([
    'not-a-number',
    '1.5',
    '1e3',
    '',
  ])('rejects the non-integer string %j, naming the function and the value', (amount) => {
    expectValidationError(
      () => scaledIntegerToDecimalString(amount, 6),
      new RegExp(`scaledIntegerToDecimalString\\(amount\\).*'${amount}'`)
    )
  })

  it('rejects invalid decimals', () => {
    expectValidationError(
      () => scaledIntegerToDecimalString('1', -1),
      /scaledIntegerToDecimalString\(decimals\).*-1/
    )
    expectValidationError(
      () => scaledIntegerToDecimalString('1', 1.5),
      /scaledIntegerToDecimalString\(decimals\).*1\.5/
    )
  })

  it.each([
    ['1000000', 6],
    ['1000000000000000000', 18],
    ['500000', 6],
    ['-500000', 6],
    ['1234500000', 6],
    ['0', 6],
    ['123456789012345678901234567890', 18],
  ] as const)('spells %s at %i decimals as a DecimalString', (amount, dp) => {
    expect(scaledIntegerToDecimalString(amount, dp)).toMatch(DECIMAL_PATTERN)
  })

  it('round-trips through decimalStringToScaledInteger', () => {
    expect(
      decimalStringToScaledInteger(
        scaledIntegerToDecimalString('1234500', 6),
        6,
        'truncate'
      )
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
  ])('rejects the non-decimal string %j, naming the value', (value) => {
    expectValidationError(
      () => truncateDecimal(value, 8),
      new RegExp(`'${value}' is not a decimal string`)
    )
  })

  it('reads a display form after the clean step', () => {
    expect(truncateDecimal('$1,000.999', 2)).toBe('1000.99')
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

describe('roundDecimalString', () => {
  it.each([
    ['1.234', 2, 'truncate', '1.23'],
    ['-1.239', 2, 'truncate', '-1.23'],
    ['1.235', 2, 'round', '1.24'],
    ['-1.235', 2, 'round', '-1.24'],
    ['1.231', 2, 'up', '1.24'],
    ['-1.231', 2, 'up', '-1.24'],
    ['1.23', 2, 'up', '1.23'],
    ['1.50', 1, 'round', '1.5'],
    ['-0.001', 2, 'truncate', '0'],
  ] as const)('rounds %s at %i decimals (%s) to %s', (value, dp, rounding, expected) => {
    expect(roundDecimalString(value, dp, rounding)).toBe(expected)
  })

  it('throws ValidationError for a bad value', () => {
    expectValidationError(
      () => roundDecimalString('abc', 2, 'round'),
      /'abc' is not a decimal string/
    )
  })

  it.each([-1, 1.5])('throws ValidationError for the decimals %j', (dp) => {
    expectValidationError(
      () => roundDecimalString('1', dp, 'round'),
      /Invalid decimals for rounding/
    )
  })
})

describe('safe convert functions', () => {
  it('give the result for valid input', () => {
    expect(safeRoundDecimalString('1.231', 2, 'up')).toBe('1.24')
    expect(safeDecimalStringToScaledInteger('0.29', 2, 'truncate')).toBe(29)
    expect(safeScaledIntegerToDecimalString('1000000', 6)).toBe('1')
    expect(safeTruncateDecimal('1.239', 2)).toBe('1.23')
    expect(safeNumberToDecimalString(1e-7)).toBe('0.0000001')
  })

  it('give undefined and warn for bad input', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeRoundDecimalString('abc', 2, 'round')).toBeUndefined()
    expect(
      safeDecimalStringToScaledInteger('9007199254740.992', 3, 'truncate')
    ).toBeUndefined()
    expect(safeScaledIntegerToDecimalString('1.5', 6)).toBeUndefined()
    expect(safeTruncateDecimal('abc', 2)).toBeUndefined()
    expect(safeNumberToDecimalString(Number.NaN)).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(5)
  })
})
