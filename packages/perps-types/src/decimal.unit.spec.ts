import { describe, expect, it } from 'vitest'
import { DECIMAL_PATTERN, isDecimalString } from './decimal.js'

const accepted = [
  '0',
  '5',
  '0.5',
  '-1.25',
  '123456789012345678901234567890.000000000000000001',
  '0.000599',
  '0.0006',
]

const rejectedStrings = [
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
]

const rejectedNonStrings: unknown[] = [null, undefined, 1]

describe('isDecimalString', () => {
  it.each(accepted)('accepts %j', (value) => {
    expect(isDecimalString(value)).toBe(true)
  })

  it.each(rejectedStrings)('rejects %j', (value) => {
    expect(isDecimalString(value)).toBe(false)
  })

  it.each(rejectedNonStrings)('rejects the non-string %j', (value) => {
    expect(isDecimalString(value)).toBe(false)
  })

  it('accepts the signed zero that the backend pattern also accepts', () => {
    expect(isDecimalString('-0')).toBe(true)
  })
})

describe('DECIMAL_PATTERN', () => {
  it('carries no global flag, so repeated tests stay stateless', () => {
    expect(DECIMAL_PATTERN.global).toBe(false)
    expect(DECIMAL_PATTERN.test('0.5')).toBe(true)
    expect(DECIMAL_PATTERN.test('0.5')).toBe(true)
  })

  it('matches the backend source pattern byte for byte', () => {
    expect(DECIMAL_PATTERN.source).toBe('^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$')
  })
})
