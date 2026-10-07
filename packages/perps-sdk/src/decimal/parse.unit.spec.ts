import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { PerpsError } from '../errors/PerpsError.js'
import {
  asDecimalString,
  decimalStringToNumber,
  formattedStringToNumber,
  isDecimalString,
  requireVenueDecimal,
} from './parse.js'

describe('formattedStringToNumber', () => {
  it.each([
    [undefined, undefined],
    [null, undefined],
    ['', 0],
    ['   ', 0],
    ['123.45', 123.45],
    ['-42.5', -42.5],
    ['+42.5', 42.5],
    ['0.07', 0.07],
    ['not-a-number', undefined],
    ['10oops', undefined],
    ['1.2.3', undefined],
    ['NaN', undefined],
    ['Infinity', undefined],
    ['$', undefined],
    ['$1,234.5', 1234.5],
    ['+$100', 100],
    ['-$50.25', -50.25],
    ['1,234,567.89', 1234567.89],
    ['  $ 42  ', 42],
    ['12.5%', 12.5],
    ['12 USD', 12],
  ])('parses %j to %j', (input, expected) => {
    expect(formattedStringToNumber(input)).toBe(expected)
  })
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
    undefined,
    null,
    '',
    '$1,234.5',
    '12.5%',
    '+42.5',
    '1e-7',
    'NaN',
    'not-a-number',
  ])('gives undefined for %j', (input) => {
    expect(decimalStringToNumber(input)).toBeUndefined()
  })

  it('gives undefined for a value too large for a finite float', () => {
    expect(decimalStringToNumber(`1${'0'.repeat(400)}`)).toBeUndefined()
  })
})

describe('asDecimalString', () => {
  it.each([
    '0',
    '1.50',
    '-0',
    '-42.5',
  ])('returns the decimal string %j unchanged', (value) => {
    expect(asDecimalString(value)).toBe(value)
  })

  it.each([
    ['1e-7', '0.0000001'],
    ['.5', '0.5'],
    ['1.', '1'],
    [42, '42'],
    [1e-7, '0.0000001'],
    [0, '0'],
    [-0, '0'],
  ])('spells %j out as %j', (value, expected) => {
    expect(asDecimalString(value)).toBe(expected)
  })

  it.each([
    undefined,
    null,
    '',
    ' 1',
    '+1',
    '1,000',
    'NaN',
    'abc',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    true,
    {},
    [],
  ])('gives undefined for %j without a throw', (value) => {
    expect(asDecimalString(value)).toBeUndefined()
  })
})

describe('requireVenueDecimal', () => {
  it('returns the decimal string of a valid value', () => {
    expect(requireVenueDecimal('12.5', 'balance', 'lighter')).toBe('12.5')
    expect(requireVenueDecimal(3, 'balance', 'lighter')).toBe('3')
  })

  it.each([
    undefined,
    'abc',
    Number.NaN,
  ])('throws an SDKError for %j', (value) => {
    const error = (() => {
      try {
        requireVenueDecimal(value, 'balance', 'lighter')
      } catch (caught) {
        return caught
      }
      return undefined
    })()
    expect(error).toBeInstanceOf(PerpsError)
    expect(error).toMatchObject({
      code: PerpsErrorCode.SDKError,
      tool: 'lighter',
      message: expect.stringContaining('`balance`'),
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
