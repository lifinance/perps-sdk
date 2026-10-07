import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { isDecimalStringGreaterThan, isDecimalStringZero } from './compare.js'

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
    ['1', '1,000'],
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
    'abc',
    '10oops',
    '0e0',
    '',
    '$0',
  ])('gives false for %j', (value) => {
    expect(isDecimalStringZero(value)).toBe(false)
  })
})
