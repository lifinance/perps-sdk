import { describe, expect, it } from 'vitest'

import { MarginMode, OrderSide, OrderType } from './enums.js'
import type { PlaceOrderParams, UpdateLeverageParams } from './action.js'

// ---------------------------------------------------------------------------
// Type-only assertions for ORD-210.
//
// These tests intentionally don't exercise runtime behaviour — `PlaceOrderParams`
// and `UpdateLeverageParams` are pure structural types with no associated
// runtime code. The point is to lock in that:
//
//   1. `marginMode` is optional (fixtures omit it and still typecheck), and
//   2. `marginMode` accepts both `MarginMode.CROSS` and `MarginMode.ISOLATED`.
//
// Vitest still runs these so the `.unit.spec.ts` glob finds them and a
// regression that broke the type would fail `pnpm test:unit` via tsc rather
// than silently shipping a breaking type change.
// ---------------------------------------------------------------------------

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
