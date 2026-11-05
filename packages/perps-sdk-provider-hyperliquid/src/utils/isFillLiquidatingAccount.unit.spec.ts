import { describe, expect, it } from 'vitest'
import { isFillLiquidatingAccount } from './isFillLiquidatingAccount.js'

const LIQUIDATED = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'
const LIQUIDATOR = '0x1111111111111111111111111111111111111111'

const liquidation = {
  liquidatedUser: LIQUIDATED,
  markPx: '2000.5',
  method: 'market',
}

describe('isFillLiquidatingAccount', () => {
  it('returns true when the address is the liquidated user', () => {
    expect(isFillLiquidatingAccount({ liquidation }, LIQUIDATED)).toBe(true)
  })

  it('ignores the case of both addresses', () => {
    expect(
      isFillLiquidatingAccount({ liquidation }, LIQUIDATED.toLowerCase())
    ).toBe(true)
    expect(
      isFillLiquidatingAccount(
        {
          liquidation: {
            ...liquidation,
            liquidatedUser: LIQUIDATED.toLowerCase(),
          },
        },
        LIQUIDATED.toUpperCase().replace('0X', '0x')
      )
    ).toBe(true)
  })

  it('returns false for the liquidator side of the same liquidation', () => {
    expect(isFillLiquidatingAccount({ liquidation }, LIQUIDATOR)).toBe(false)
  })

  it('returns false when the fill has no liquidation block', () => {
    expect(isFillLiquidatingAccount({}, LIQUIDATED)).toBe(false)
  })
})
