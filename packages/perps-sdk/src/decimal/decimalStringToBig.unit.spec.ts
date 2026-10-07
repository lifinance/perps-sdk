import { PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import {
  bigToDecimalString,
  decimalStringToBig,
  decimalStringToDivBig,
} from './decimalStringToBig.js'

describe('decimalStringToBig', () => {
  it.each([
    ['0', '0'],
    ['1.5', '1.5'],
    ['-2.25', '-2.25'],
  ])('reads %j as %s', (value, expected) => {
    expect(decimalStringToBig(value).toFixed()).toBe(expected)
  })

  it.each([
    '1e-8',
    '1E5',
    'n/a',
    '',
    '$',
    '$1,234.5',
    '0.05%',
    ' 1 ',
  ])('throws ValidationError for %j', (value) => {
    expect(() => decimalStringToBig(value)).toThrowError(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining(`'${value}'`),
      })
    )
  })

  it('throws ValidationError for a non-string value', () => {
    expect(() => decimalStringToBig(1 as unknown as string)).toThrowError(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})

describe('bigToDecimalString', () => {
  it('spells a value with no exponent', () => {
    expect(bigToDecimalString(new Big('1e-8'))).toBe('0.00000001')
  })

  it('spells a negative zero as 0', () => {
    expect(bigToDecimalString(new Big('-0'))).toBe('0')
  })
})

describe('decimalStringToDivBig', () => {
  it('divides to 40 decimal places', () => {
    expect(decimalStringToDivBig('1').div(3).toFixed()).toBe(
      `0.${'3'.repeat(40)}`
    )
  })
})
