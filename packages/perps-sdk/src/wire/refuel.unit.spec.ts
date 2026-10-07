import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { isDecimalString } from '../decimal/parse.js'
import {
  calculateRefuelAmount,
  REFUEL_FEE_MARGIN_PERCENT,
  type RefuelAmountInput,
} from './refuel.js'

const input = (
  overrides: Partial<RefuelAmountInput> = {}
): RefuelAmountInput => ({
  recommendedAmount: '2000000000000000',
  recommendedUsd: '5',
  nativeBalance: '0',
  priceUsd: '1',
  decimals: 6,
  ...overrides,
})

describe('calculateRefuelAmount', () => {
  it('holds a 20% fee margin', () => {
    expect(REFUEL_FEE_MARGIN_PERCENT).toBe(20)
  })

  it('buys the whole recommendation plus the margin on a zero balance', () => {
    expect(calculateRefuelAmount(input())).toBe('6.000000')
  })

  it('buys only the deficit plus the margin on a partial balance', () => {
    expect(
      calculateRefuelAmount(input({ nativeBalance: '1500000000000000' }))
    ).toBe('1.500000')
  })

  it.each([
    ['at', '2000000000000000'],
    ['above', '2000000000000001'],
  ])('has no amount for a balance %s the recommendation', (_, nativeBalance) => {
    expect(calculateRefuelAmount(input({ nativeBalance }))).toBe(undefined)
  })

  it('rounds up so the refuel never lands short', () => {
    expect(
      calculateRefuelAmount(
        input({ recommendedUsd: '1', priceUsd: '7', decimals: 2 })
      )
    ).toBe('0.18')
  })

  it('carries a repeating quotient to the last of 18 decimals, rounded up', () => {
    expect(
      calculateRefuelAmount(
        input({ recommendedUsd: '1', priceUsd: '7', decimals: 18 })
      )
    ).toBe('0.171428571428571429')
  })

  it('spells a 6-decimal token to 6 decimals', () => {
    expect(
      calculateRefuelAmount(
        input({ recommendedUsd: '1', priceUsd: '7', decimals: 6 })
      )
    ).toBe('0.171429')
  })

  it('keeps a whole-token grid free of a decimal point', () => {
    const amount = calculateRefuelAmount(
      input({ recommendedUsd: '4', priceUsd: '3', decimals: 0 })
    )
    expect(amount).toBe('2')
    expect(isDecimalString(amount)).toBe(true)
  })

  it.each<[string, Partial<RefuelAmountInput>]>([
    ['no recommended gas', { recommendedAmount: '0' }],
    ['a negative recommendation', { recommendedAmount: '-1' }],
    ['a zero recommendation value', { recommendedUsd: '0' }],
    ['a negative recommendation value', { recommendedUsd: '-1' }],
    ['an unpriced source token', { priceUsd: '0' }],
    ['a negative price', { priceUsd: '-1' }],
  ])('has no amount for %s', (_, overrides) => {
    expect(calculateRefuelAmount(input(overrides))).toBe(undefined)
  })

  it.each<[keyof RefuelAmountInput, Partial<RefuelAmountInput>]>([
    ['recommendedAmount', { recommendedAmount: '1.5' }],
    ['nativeBalance', { nativeBalance: '1e3' }],
    ['recommendedUsd', { recommendedUsd: '4e0' }],
    ['priceUsd', { priceUsd: '$1' }],
  ])('rejects a malformed `%s`', (field, overrides) => {
    expect(() => calculateRefuelAmount(input(overrides))).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining(`\`${field}\``),
      })
    )
  })

  it.each([-1, 1.5, Number.NaN])('rejects `decimals` of %s', (decimals) => {
    expect(() => calculateRefuelAmount(input({ decimals }))).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})
