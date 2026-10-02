import { isDecimalString, PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { calculateRefuelAmount } from './refuel.js'

describe('calculateRefuelAmount', () => {
  it('converts the recommended gas value into the source token', () => {
    expect(
      calculateRefuelAmount({ gasUsd: '4', priceUsd: '1', decimals: 6 })
    ).toBe('4.000000')
  })

  it('rounds up so the refuel never lands short', () => {
    expect(
      calculateRefuelAmount({ gasUsd: '4', priceUsd: '3', decimals: 2 })
    ).toBe('1.34')
  })

  it('carries a repeating quotient to the last of 18 decimals', () => {
    expect(
      calculateRefuelAmount({ gasUsd: '1', priceUsd: '3', decimals: 18 })
    ).toBe('0.333333333333333334')
  })

  it('keeps a whole-token grid free of a decimal point', () => {
    const amount = calculateRefuelAmount({
      gasUsd: '4',
      priceUsd: '3',
      decimals: 0,
    })
    expect(amount).toBe('2')
    expect(isDecimalString(amount)).toBe(true)
  })

  it.each([
    ['no gas to buy', '0', '1'],
    ['a negative gas value', '-1', '1'],
    ['an unpriced source token', '4', '0'],
    ['a negative price', '4', '-1'],
  ])('has no amount for %s', (_, gasUsd, priceUsd) => {
    expect(calculateRefuelAmount({ gasUsd, priceUsd, decimals: 18 })).toBe(
      undefined
    )
  })

  it.each([
    ['gasUsd', '4e0', '1'],
    ['priceUsd', '4', '$1'],
  ])('rejects a non-decimal `%s`', (field, gasUsd, priceUsd) => {
    expect(() =>
      calculateRefuelAmount({ gasUsd, priceUsd, decimals: 18 })
    ).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining(`\`${field}\``),
      })
    )
  })

  it.each([-1, 1.5, Number.NaN])('rejects `decimals` of %s', (decimals) => {
    expect(() =>
      calculateRefuelAmount({ gasUsd: '4', priceUsd: '1', decimals })
    ).toThrow(expect.objectContaining({ code: PerpsErrorCode.ValidationError }))
  })
})
