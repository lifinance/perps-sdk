import { describe, expect, it } from 'vitest'
import { isDecimalString, parseDecimal } from './parse.js'

describe('parseDecimal', () => {
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
    expect(parseDecimal(input)).toBe(expected)
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
