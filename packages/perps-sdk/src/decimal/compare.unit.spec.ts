import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compareDecimalStrings,
  isDecimalStringGreaterThan,
  isDecimalStringZero,
  safeCompareDecimalStrings,
  safeIsDecimalStringGreaterThan,
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
    ['$1,000', '999.5', true],
  ] as const)('gives %s > %s as %s', (a, b, expected) => {
    expect(isDecimalStringGreaterThan(a, b)).toBe(expected)
  })

  it.each([
    ['1e-7', '1'],
    ['1', '1e-7'],
    ['', '1'],
    ['abc', '1'],
  ])('throws ValidationError for %j vs %j', (a, b) => {
    expect(() => isDecimalStringGreaterThan(a, b)).toThrow(
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

  it('reads a display form after the clean step', () => {
    expect(isDecimalStringZero('$0')).toBe(true)
  })

  it.each([
    'abc',
    '10oops',
    '0e0',
    '',
  ])('throws ValidationError for %j', (value) => {
    expect(() => isDecimalStringZero(value)).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
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
    expect(safeIsDecimalStringGreaterThan('2', '1')).toBe(true)
    expect(safeIsDecimalStringZero('0.0')).toBe(true)
    expect(safeCompareDecimalStrings('1', '2')).toBe(-1)
  })

  it('give undefined and warn for a bad operand', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeIsDecimalStringGreaterThan('abc', '1')).toBeUndefined()
    expect(safeIsDecimalStringZero('abc')).toBeUndefined()
    expect(safeCompareDecimalStrings('1', 'abc')).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(3)
  })
})
