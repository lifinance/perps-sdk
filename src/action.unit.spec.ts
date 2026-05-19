import { describe, expect, it } from 'vitest'

import { MarginMode, OrderSide, OrderType } from './enums.js'
import type { PlaceOrderParams, UpdateLeverageParams } from './action.js'

// Locks in that `marginMode` is optional on `PlaceOrderParams` /
// `UpdateLeverageParams` and accepts both `MarginMode.CROSS` and
// `MarginMode.ISOLATED`. Pure type-level assertions; vitest still picks the
// file up via the `.unit.spec.ts` glob.
describe('PlaceOrderParams', () => {
  it('accepts a fixture without marginMode (optional field)', () => {
    const params: PlaceOrderParams = {
      asset: { assetId: 'BTC', market: 'lighter' },
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      size: '0.1',
      price: '60000',
    }

    expect(params.marginMode).toBeUndefined()
  })

  it('accepts marginMode: ISOLATED', () => {
    const params: PlaceOrderParams = {
      asset: { assetId: 'BTC', market: 'lighter' },
      side: OrderSide.BUY,
      size: '0.1',
      marginMode: MarginMode.ISOLATED,
    }

    expect(params.marginMode).toBe(MarginMode.ISOLATED)
  })

  it('accepts marginMode: CROSS', () => {
    const params: PlaceOrderParams = {
      asset: { assetId: 'BTC', market: 'hyperliquid' },
      side: OrderSide.SELL,
      size: '0.1',
      marginMode: MarginMode.CROSS,
    }

    expect(params.marginMode).toBe(MarginMode.CROSS)
  })
})

describe('UpdateLeverageParams', () => {
  it('accepts a fixture without marginMode (optional field)', () => {
    const params: UpdateLeverageParams = {
      asset: { assetId: 'ETH', market: 'lighter' },
      leverage: 10,
    }

    expect(params.marginMode).toBeUndefined()
  })

  it('accepts marginMode: ISOLATED', () => {
    const params: UpdateLeverageParams = {
      asset: { assetId: 'ETH', market: 'lighter' },
      leverage: 10,
      marginMode: MarginMode.ISOLATED,
    }

    expect(params.marginMode).toBe(MarginMode.ISOLATED)
  })

  it('accepts marginMode: CROSS', () => {
    const params: UpdateLeverageParams = {
      asset: { assetId: 'ETH', market: 'hyperliquid' },
      leverage: 5,
      marginMode: MarginMode.CROSS,
    }

    expect(params.marginMode).toBe(MarginMode.CROSS)
  })
})
