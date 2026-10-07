import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PerpsError } from '../errors/PerpsError.js'
import {
  decimalStringToNumber,
  isDecimalString,
  safeDecimalStringToNumber,
  unknownToDecimalString,
} from './parse.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('decimalStringToNumber', () => {
  it.each([
    ['0', 0],
    ['123.45', 123.45],
    ['-42.5', -42.5],
    ['0.000599', 0.000599],
  ])('reads %j as %j', (input, expected) => {
    expect(decimalStringToNumber(input)).toBe(expected)
  })

  it.each([
    '',
    '+42.5',
    '1e-7',
    'NaN',
    'not-a-number',
    '$1,234.5',
    '12.5%',
  ])('throws ValidationError for %j', (input) => {
    expect(() => decimalStringToNumber(input)).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })

  it('throws ValidationError for a value too large for a finite float', () => {
    expect(() => decimalStringToNumber(`1${'0'.repeat(400)}`)).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})

describe('safeDecimalStringToNumber', () => {
  it('reads a valid decimal string', () => {
    expect(safeDecimalStringToNumber('1.5')).toBe(1.5)
  })

  it('gives undefined and warns for a bad value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeDecimalStringToNumber('abc')).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
  })
})

const catchError = (fn: () => unknown): unknown => {
  try {
    fn()
  } catch (caught) {
    return caught
  }
  return undefined
}

describe('unknownToDecimalString', () => {
  it.each([
    '0',
    '1.50',
    '-0',
    '-42.5',
  ])('returns the decimal string %j unchanged', (value) => {
    expect(unknownToDecimalString(value, 'balance', 'lighter')).toBe(value)
  })

  it.each([
    ['1e-7', '0.0000001'],
    ['.5', '0.5'],
    ['1.', '1'],
    [42, '42'],
    [3, '3'],
    [1e-7, '0.0000001'],
    [0, '0'],
    [-0, '0'],
    ['1e-400', `0.${'0'.repeat(399)}1`],
  ])('spells %j out as %j', (value, expected) => {
    expect(unknownToDecimalString(value, 'balance', 'lighter')).toBe(expected)
  })

  it.each([
    undefined,
    null,
    '',
    ' 1',
    '+1',
    '1,000',
    '$1',
    'NaN',
    'abc',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    true,
    {},
    [],
    '1e999999999',
    '1e-999999999',
  ])('throws an SDKError naming the field and the tool for %j', (value) => {
    const error = catchError(() =>
      unknownToDecimalString(value, 'balance', 'lighter')
    )
    expect(error).toBeInstanceOf(PerpsError)
    expect(error).toMatchObject({
      code: PerpsErrorCode.SDKError,
      tool: 'lighter',
      message: expect.stringMatching(/^lighter field `balance`/),
    })
  })
})

describe('isDecimalString', () => {
  it.each([
    '0',
    '5',
    '0.5',
    '-1.25',
    '123456789012345678901234567890.000000000000000001',
    '0.000599',
    '0.0006',
  ])('accepts %j', (value) => {
    expect(isDecimalString(value)).toBe(true)
  })

  it.each([
    '',
    ' 1',
    '1 ',
    '.5',
    '1.',
    '01',
    '-0.',
    '1e-7',
    '1E7',
    '1,000',
    '$1',
    '1 USD',
    'NaN',
    'Infinity',
    '+1',
  ])('rejects %j', (value) => {
    expect(isDecimalString(value)).toBe(false)
  })

  it.each([null, undefined, 1])('rejects the non-string %j', (value) => {
    expect(isDecimalString(value)).toBe(false)
  })

  it('accepts the signed zero that the backend pattern also accepts', () => {
    expect(isDecimalString('-0')).toBe(true)
  })
})
