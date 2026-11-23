import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compareDecimalStrings,
  isDecimalStringEqual,
  isDecimalStringGreaterThan,
  isDecimalStringInteger,
  isDecimalStringZero,
  safeCompareDecimalStrings,
  safeIsDecimalStringEqual,
  safeIsDecimalStringGreaterThan,
  safeIsDecimalStringInteger,
  safeIsDecimalStringZero,
} from './compare.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isDecimalStringGreaterThan', () => {
  it.each([
    ['1.0000000000000001', '1', true],
    ['1', '1.0000000000000001', false],
    ['1.0', '1', false],
    ['1', '1.0', false],
    ['0', '0', false],
    ['-0.5', '-1', true],
    ['-1', '0', false],
    [
      '123456789012345678901234567890.000000000000000002',
      '123456789012345678901234567890.000000000000000001',
      true,
    ],
  ] as const)('gives %s > %s as %s', (a, b, expected) => {
    expect(isDecimalStringGreaterThan(a, b)).toBe(expected)
  })

  it.each([
    ['1e-7', '1'],
    ['1', '1e-7'],
    ['', '1'],
    ['abc', '1'],
    ['$1,000', '999.5'],
  ])('throws ValidationError for %j vs %j', (a, b) => {
    expect(() => isDecimalStringGreaterThan(a, b)).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})

describe('isDecimalStringEqual', () => {
  it.each([
    ['1', '1'],
    ['1', '1.0'],
    ['1.00', '1'],
    ['-2.5', '-2.50'],
    ['0', '0.000'],
    ['0', '-0'],
    [
      '123456789012345678901234567890.000000000000000001',
      '123456789012345678901234567890.0000000000000000010',
    ],
  ])('gives true for %j and %j', (a, b) => {
    expect(isDecimalStringEqual(a, b)).toBe(true)
    expect(isDecimalStringEqual(b, a)).toBe(true)
  })

  it.each([
    ['1', '2'],
    ['1.0000000000000001', '1'],
    ['9007199254740993', '9007199254740992'],
    ['-1', '1'],
    ['0', '0.0000000000000000001'],
  ])('gives false for %j and %j', (a, b) => {
    expect(isDecimalStringEqual(a, b)).toBe(false)
    expect(isDecimalStringEqual(b, a)).toBe(false)
  })

  it.each([
    ['01.00', '1'],
    ['1', '1e0'],
    ['', '0'],
    ['abc', '1'],
    ['$1', '1'],
  ])('throws ValidationError for %j vs %j', (a, b) => {
    expect(() => isDecimalStringEqual(a, b)).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})

describe('isDecimalStringZero', () => {
  it.each([
    '0',
    '0.0',
    '-0',
    '0.000000000000000000',
  ])('gives true for %j', (value) => {
    expect(isDecimalStringZero(value)).toBe(true)
  })

  it.each([
    '1',
    '-0.5',
    '0.0000000000000000001',
  ])('gives false for %j', (value) => {
    expect(isDecimalStringZero(value)).toBe(false)
  })

  it.each([
    'abc',
    '10oops',
    '0e0',
    '',
    '$0',
  ])('throws ValidationError for %j', (value) => {
    expect(() => isDecimalStringZero(value)).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})

describe('isDecimalStringInteger', () => {
  it.each([
    '700',
    '700.0',
    '-3',
    '0',
    '0.000',
    '10000',
  ])('gives true for %j', (value) => {
    expect(isDecimalStringInteger(value)).toBe(true)
  })

  it.each([
    '700.5',
    '0.0000000000000000001',
    '-0.1',
    '6.67',
  ])('gives false for %j', (value) => {
    expect(isDecimalStringInteger(value)).toBe(false)
  })

  it.each([
    'abc',
    '1e3',
    '',
    '700bps',
    'NaN',
  ])('throws ValidationError for %j', (value) => {
    expect(() => isDecimalStringInteger(value)).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })

  it('safe form gives the result, or undefined with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeIsDecimalStringInteger('667')).toBe(true)
    expect(safeIsDecimalStringInteger('abc')).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('compareDecimalStrings', () => {
  it.each([
    ['1', '2', -1],
    ['2.0', '2', 0],
    ['2', '1.9999999999999999999', 1],
  ] as const)('compares %s with %s as %s', (a, b, expected) => {
    expect(compareDecimalStrings(a, b)).toBe(expected)
  })

  it('throws ValidationError for a bad operand', () => {
    expect(() => compareDecimalStrings('abc', '1')).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})

describe('safe compare functions', () => {
  it('give the result for valid operands', () => {
    expect(safeIsDecimalStringEqual('1', '1.0')).toBe(true)
    expect(safeIsDecimalStringEqual('1', '2')).toBe(false)
    expect(safeIsDecimalStringGreaterThan('2', '1')).toBe(true)
    expect(safeIsDecimalStringZero('0.0')).toBe(true)
    expect(safeCompareDecimalStrings('1', '2')).toBe(-1)
  })

  it('give undefined and warn for a bad operand', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeIsDecimalStringEqual('abc', '1')).toBeUndefined()
    expect(safeIsDecimalStringGreaterThan('abc', '1')).toBeUndefined()
    expect(safeIsDecimalStringZero('abc')).toBeUndefined()
    expect(safeCompareDecimalStrings('1', 'abc')).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(4)
    expect(warn).toHaveBeenCalledWith(
      '[perps-sdk] isDecimalStringEqual failed',
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})
