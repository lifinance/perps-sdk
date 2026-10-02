import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { calculateWithdrawMax } from './withdraw.js'

describe('calculateWithdrawMax', () => {
  it.each([
    ['a deducted fee', '10', '0.5', true, '10'],
    ['an on-top fee', '10', '0.5', false, '9.5'],
    ['an on-top fee equal to the balance', '0.5', '0.5', false, '0'],
    ['an on-top fee above the balance', '1', '2.5', false, '0'],
    ['an on-top fee of zero', '9.975', '0', false, '9.975'],
    ['an unstated fee treatment', '10', '0.5', undefined, '10'],
  ])('gives the largest funded amount for %s', (_, available, fee, deducted, expected) => {
    expect(
      calculateWithdrawMax({
        available,
        withdrawalFee: fee,
        ...(deducted === undefined ? {} : { isFeeDeducted: deducted }),
      })
    ).toBe(expected)
  })

  it('gives `available` when the venue publishes no fee', () => {
    expect(calculateWithdrawMax({ available: '2248.756257' })).toBe(
      '2248.756257'
    )
  })

  it('keeps an on-top remainder exact rather than rounding it', () => {
    expect(
      calculateWithdrawMax({
        available: '10.9999999',
        withdrawalFee: '0.5',
        isFeeDeducted: false,
      })
    ).toBe('10.4999999')
  })

  it.each([
    ['available', '1e-7', '0.5'],
    ['withdrawalFee', '10', '0.5 USDC'],
  ])('rejects a non-decimal `%s`', (field, available, fee) => {
    expect(() =>
      calculateWithdrawMax({
        available,
        withdrawalFee: fee,
        isFeeDeducted: false,
      })
    ).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining(`\`${field}\``),
      })
    )
  })
})
