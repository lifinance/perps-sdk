import { describe, expect, it } from 'vitest'

import { ActionType, MarginMode, OrderSide, OrderType } from './enums.js'
import type {
  ActionResult,
  PlaceOrderParams,
  UpdateLeverageParams,
} from './action.js'

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

describe('ActionResult', () => {
  it('accepts a success fixture with orderId; success branch has no error', () => {
    const result: ActionResult = {
      action: ActionType.PLACE_ORDER,
      success: true,
      orderId: 'lighter-12345',
    }

    if (result.success) {
      expect(result.orderId).toBe('lighter-12345')
      // @ts-expect-error — `error` is not present on the success variant
      result.error
    } else {
      throw new Error('expected success branch')
    }
  })

  it('accepts a failure fixture with required error', () => {
    const result: ActionResult = {
      action: ActionType.PLACE_ORDER,
      success: false,
      error: 'order rejected',
    }

    if (!result.success) {
      expect(result.error).toBe('order rejected')
      // @ts-expect-error — `orderId` is not present on the failure variant
      result.orderId
    } else {
      throw new Error('expected failure branch')
    }
  })

  it('narrows the discriminated union on `success` so `error` is required only on the failure branch', () => {
    const results: ActionResult[] = [
      {
        action: ActionType.PLACE_ORDER,
        success: true,
        orderId: 'hl-1',
      },
      {
        action: ActionType.PLACE_ORDER,
        success: false,
        error: 'rejected',
      },
    ]

    const errors = results.flatMap((r) => (r.success ? [] : [r.error]))

    expect(errors).toEqual(['rejected'])
  })
})
