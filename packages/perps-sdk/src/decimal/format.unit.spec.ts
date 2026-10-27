import { describe, expect, it } from 'vitest'
import {
  formatCompactUsd,
  formatNumber,
  formatPrice,
  formatSignedPercent,
  formatSignedUsd,
  formatUsd,
} from './format.js'

describe('formatUsd', () => {
  it('formats a positive value with grouping', () => {
    expect(formatUsd(1234.5, { locale: 'en-US' })).toBe('$1,234.50')
  })

  it('places the minus before the dollar sign for negatives', () => {
    expect(formatUsd(-1500, { locale: 'en-US' })).toBe('-$1,500.00')
  })

  it('is unsigned for positive values (no +)', () => {
    expect(formatUsd(42, { locale: 'en-US' })).toBe('$42.00')
  })

  it('shows a string that does not match the decimal pattern unchanged', () => {
    expect(formatUsd('$1,234.50', { locale: 'en-US' })).toBe('$1,234.50')
  })

  it('renders the placeholder for null (not $0.00)', () => {
    expect(formatUsd(null)).toBe('—')
  })

  it('renders the placeholder for undefined', () => {
    expect(formatUsd(undefined)).toBe('—')
  })

  it('renders the placeholder for NaN (not $NaN)', () => {
    expect(formatUsd(Number.NaN)).toBe('—')
  })

  it('renders the placeholder for non-finite values', () => {
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe('—')
  })

  it('shows an unparseable string unchanged', () => {
    expect(formatUsd('abc')).toBe('abc')
  })

  it('honours a custom placeholder', () => {
    expect(formatUsd(null, { placeholder: 'N/A' })).toBe('N/A')
  })

  it('distinguishes a real zero from a null', () => {
    expect(formatUsd(0, { locale: 'en-US' })).toBe('$0.00')
  })
})

describe('formatSignedUsd', () => {
  it('prefixes positive values with +', () => {
    expect(formatSignedUsd(1.43, { locale: 'en-US' })).toBe('+$1.43')
  })

  it('prefixes negative values with -', () => {
    expect(formatSignedUsd(-1.43, { locale: 'en-US' })).toBe('-$1.43')
  })

  it('emits no sign for zero', () => {
    expect(formatSignedUsd(0, { locale: 'en-US' })).toBe('$0.00')
  })

  it('derives the sign after rounding: +0.004 → $0.00', () => {
    expect(formatSignedUsd(0.004, { locale: 'en-US' })).toBe('$0.00')
  })

  it('derives the sign after rounding: -0.004 → $0.00 (no -$0.00)', () => {
    expect(formatSignedUsd(-0.004, { locale: 'en-US' })).toBe('$0.00')
  })

  it('renders the placeholder for null', () => {
    expect(formatSignedUsd(null)).toBe('—')
  })
})

describe('formatSignedPercent', () => {
  it('prefixes positive values with +', () => {
    expect(formatSignedPercent(1.43, { locale: 'en-US' })).toBe('+1.43%')
  })

  it('prefixes negative values with -', () => {
    expect(formatSignedPercent(-1.43, { locale: 'en-US' })).toBe('-1.43%')
  })

  it('derives the sign after rounding: -0.004 → 0.00% (no -0.00%)', () => {
    expect(formatSignedPercent(-0.004, { locale: 'en-US' })).toBe('0.00%')
  })

  it('does not group thousands', () => {
    expect(formatSignedPercent(1234.5, { locale: 'en-US' })).toBe('+1234.50%')
  })

  it('renders the placeholder for non-finite input', () => {
    expect(formatSignedPercent(Number.NaN)).toBe('—')
  })
})

describe('formatPrice', () => {
  it('uses 2 decimals and grouping for magnitudes >= 1000', () => {
    expect(formatPrice(1234.5, { locale: 'en-US' })).toBe('$1,234.50')
  })

  it('places the minus before the dollar sign for negatives', () => {
    expect(formatPrice(-1500, { locale: 'en-US' })).toBe('-$1,500.00')
  })

  it('uses 2 decimals for magnitudes >= 1', () => {
    expect(formatPrice(42.5, { locale: 'en-US' })).toBe('$42.50')
  })

  it('uses 4 decimals for magnitudes >= 0.1', () => {
    expect(formatPrice(0.1234, { locale: 'en-US' })).toBe('$0.1234')
  })

  it('uses 5 decimals for magnitudes >= 0.01', () => {
    expect(formatPrice(0.01234, { locale: 'en-US' })).toBe('$0.01234')
  })

  it('uses 6 decimals for sub-0.01 magnitudes', () => {
    expect(formatPrice(0.001234, { locale: 'en-US' })).toBe('$0.001234')
  })

  it('does not group below 1000', () => {
    expect(formatPrice(999.5, { locale: 'en-US' })).toBe('$999.50')
  })

  it('renders the placeholder for null', () => {
    expect(formatPrice(null)).toBe('—')
  })
})

describe('formatNumber', () => {
  it('formats a bare number with grouping and no symbol', () => {
    expect(formatNumber(1234.5, { locale: 'en-US' })).toBe('1,234.50')
  })

  it('keeps a leading minus without a symbol', () => {
    expect(formatNumber(-1500, { locale: 'en-US' })).toBe('-1,500.00')
  })

  it('is unsigned for positive values (no +)', () => {
    expect(formatNumber(42, { locale: 'en-US' })).toBe('42.00')
  })

  it('shows a string that does not match the decimal pattern unchanged', () => {
    expect(formatNumber('$1,234.50', { locale: 'en-US' })).toBe('$1,234.50')
  })

  it('honours a custom decimals count', () => {
    expect(formatNumber(12.5, { decimals: 1, locale: 'en-US' })).toBe('12.5')
  })

  it('renders the placeholder for null (not 0.00)', () => {
    expect(formatNumber(null)).toBe('—')
  })

  it('renders the placeholder for NaN', () => {
    expect(formatNumber(Number.NaN)).toBe('—')
  })

  it('honours a custom placeholder', () => {
    expect(formatNumber(null, { placeholder: 'N/A' })).toBe('N/A')
  })

  it('passes the locale through to grouping separators', () => {
    expect(formatNumber(1234.5, { locale: 'de-DE' })).toBe('1.234,50')
  })

  it('rounds half-up by default', () => {
    expect(formatNumber(99.999, { locale: 'en-US' })).toBe('100.00')
  })

  it('floors toward zero at the decimal boundary', () => {
    expect(formatNumber(99.999, { rounding: 'floor', locale: 'en-US' })).toBe(
      '99.99'
    )
  })

  it('floors negatives toward zero (magnitude never exceeds source)', () => {
    expect(formatNumber(-99.999, { rounding: 'floor', locale: 'en-US' })).toBe(
      '-99.99'
    )
  })

  it('floor truncates float-noise values correctly (0.29 → 0.29)', () => {
    expect(formatNumber(0.29, { rounding: 'floor', locale: 'en-US' })).toBe(
      '0.29'
    )
  })

  it('floor emits no minus when the magnitude collapses to zero', () => {
    expect(formatNumber(-0.004, { rounding: 'floor', locale: 'en-US' })).toBe(
      '0.00'
    )
  })

  it('floors with custom decimals', () => {
    expect(
      formatNumber(1.23456, { decimals: 3, rounding: 'floor', locale: 'en-US' })
    ).toBe('1.234')
  })

  it('floors a magnitude of 1e21 at 2 decimals', () => {
    expect(
      formatNumber('1000000000000000000000', {
        rounding: 'floor',
        locale: 'en-US',
      })
    ).toBe('1,000,000,000,000,000,000,000.00')
  })

  it('floors a magnitude above 1e21 at 0 decimals', () => {
    expect(
      formatNumber('2500000000000000000000', {
        decimals: 0,
        rounding: 'floor',
        locale: 'en-US',
      })
    ).toBe('2,500,000,000,000,000,000,000')
  })

  it('floors a negative magnitude of 1e21 at 0 decimals', () => {
    expect(
      formatNumber(-1e21, { decimals: 0, rounding: 'floor', locale: 'en-US' })
    ).toBe('-1,000,000,000,000,000,000,000')
  })
})

describe('rounding option on the $/% wrappers', () => {
  it('formatUsd floors toward zero', () => {
    expect(formatUsd(99.999, { rounding: 'floor', locale: 'en-US' })).toBe(
      '$99.99'
    )
  })

  it('formatUsd defaults to half-up (byte-identical to before)', () => {
    expect(formatUsd(99.999, { locale: 'en-US' })).toBe('$100.00')
  })

  it('formatSignedUsd floors the magnitude while keeping the sign', () => {
    expect(
      formatSignedUsd(-1.239, { rounding: 'floor', locale: 'en-US' })
    ).toBe('-$1.23')
  })

  it('formatSignedPercent floors toward zero', () => {
    expect(
      formatSignedPercent(1.239, { rounding: 'floor', locale: 'en-US' })
    ).toBe('+1.23%')
  })
})

describe('formatCompactUsd', () => {
  it('uses a B suffix for billions', () => {
    expect(formatCompactUsd(1_230_000_000)).toBe('$1.23B')
  })

  it('uses an M suffix for millions', () => {
    expect(formatCompactUsd(45_600_000)).toBe('$45.60M')
  })

  it('uses a K suffix for thousands', () => {
    expect(formatCompactUsd(789_000)).toBe('$789.00K')
  })

  it('has no suffix below 1000', () => {
    expect(formatCompactUsd(12.34)).toBe('$12.34')
  })

  it('places the minus before the dollar sign for negatives', () => {
    expect(formatCompactUsd(-1_230_000_000)).toBe('-$1.23B')
  })

  it('renders the placeholder for null', () => {
    expect(formatCompactUsd(null)).toBe('—')
  })

  it('shows a string that does not match the decimal pattern unchanged', () => {
    expect(formatCompactUsd('$84.5K', { significantDigits: 3 })).toBe('$84.5K')
  })

  it('truncates the mantissa with floor rounding', () => {
    expect(formatCompactUsd(84_559.55, { rounding: 'floor' })).toBe('$84.55K')
  })

  it.each([
    [999.999, '$999.99'],
    [12.349, '$12.34'],
    [-0.004, '$0.00'],
    [0, '$0.00'],
  ])('formats %s below 1000 as %s with floor rounding', (value, expected) => {
    expect(
      formatCompactUsd(value, { locale: 'en-US', rounding: 'floor' })
    ).toBe(expected)
  })

  it('uses the locale decimal separator below 1000', () => {
    expect(formatCompactUsd(12.34, { locale: 'de-DE' })).toBe('$12,34')
  })

  it('rounds half up with significant digits by default', () => {
    expect(formatCompactUsd(84_559.55, { significantDigits: 3 })).toBe('$84.6K')
  })

  it.each([
    [999_999.999, {}, '$1.00M'],
    [999_999.99, { significantDigits: 3 }, '$1M'],
    [999_999_999.999, {}, '$1.00B'],
    [999_999.99, { rounding: 'floor', significantDigits: 3 }, '$999K'],
  ] as const)('promotes %s to the next tier when rounding reaches 1000 (%o)', (value, options, expected) => {
    expect(formatCompactUsd(value, options)).toBe(expected)
  })

  it('uses significant digits in the billions tier', () => {
    expect(
      formatCompactUsd(1_259_000_000, {
        rounding: 'floor',
        significantDigits: 3,
      })
    ).toBe('$1.25B')
  })

  it.each([
    [84_559, 1, '$80K'],
    [845_999, 2, '$840K'],
    [845_999, 3, '$845K'],
    [1_259_000_000_000, 2, '$1,200B'],
  ])('applies significant digits to the integer part: %s with %s digits is %s', (value, significantDigits, expected) => {
    expect(
      formatCompactUsd(value, {
        locale: 'en-US',
        rounding: 'floor',
        significantDigits,
      })
    ).toBe(expected)
  })

  it('keeps fixed decimals without significant digits', () => {
    expect(formatCompactUsd(84_000, { rounding: 'floor' })).toBe('$84.00K')
  })

  it('uses the locale decimal separator for the compact number', () => {
    expect(formatCompactUsd(84_559.55, { locale: 'de-DE' })).toBe('$84,56K')
  })

  it('groups a compact number of 1000 or more in the billions tier', () => {
    expect(formatCompactUsd(1_234_000_000_000, { locale: 'en-US' })).toBe(
      '$1,234.00B'
    )
  })

  it('reads a DecimalString value and compactFrom', () => {
    expect(
      formatCompactUsd('84559.55', {
        rounding: 'floor',
        significantDigits: 3,
        compactFrom: '10000',
      })
    ).toBe('$84.5K')
  })

  it.each([
    [84_559.55, '$84.5K'],
    [845_999, '$845K'],
    [1_259_000, '$1.25M'],
    [84_000, '$84K'],
    [10_000, '$10K'],
    [999_999.99, '$999K'],
    [1_000_000, '$1M'],
    [9_999.999, '$9,999.99'],
    [-9_999.999, '-$9,999.99'],
    [-84_559.55, '-$84.5K'],
    ['84599.999999999999999999999999', '$84.5K'],
  ])('formats %s as %s with floor, 3 significant digits and compactFrom 10000', (value, expected) => {
    expect(
      formatCompactUsd(value, {
        locale: 'en-US',
        rounding: 'floor',
        significantDigits: 3,
        compactFrom: '10000',
      })
    ).toBe(expected)
  })
})
