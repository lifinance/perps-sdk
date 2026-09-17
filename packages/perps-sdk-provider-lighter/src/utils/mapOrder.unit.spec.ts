import {
  type MarketDisplay,
  OrderSide,
  OrderStatus,
  OrderType,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { LtOrder } from '../types/index.js'
import { mapOrder, mapOrderDetail, mapStatusReason } from './mapOrder.js'

const SYMBOL = 'ETH'
const MARKET: MarketDisplay = {
  providerId: 'lighter',
  id: '1',
  categoryId: 'lighter',
  baseAsset: {
    providerId: 'lighter',
    id: '1',
    displaySymbol: SYMBOL,
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'lighter',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: '',
  },
}

const baseOrder = (overrides: Partial<LtOrder> = {}): LtOrder => ({
  order_index: 1,
  client_order_index: 0,
  order_id: 'lt-1',
  client_order_id: '0',
  market_index: 1,
  owner_account_index: 42,
  initial_base_amount: '1',
  price: '2000',
  nonce: 0,
  remaining_base_amount: '0',
  is_ask: false,
  filled_base_amount: '1',
  filled_quote_amount: '2000',
  side: 'buy',
  type: 'limit',
  time_in_force: 'good_till_time',
  reduce_only: false,
  trigger_price: '0',
  order_expiry: 0,
  status: 'filled',
  trigger_status: '',
  trigger_time: 0,
  parent_order_index: 0,
  parent_order_id: '',
  to_trigger_order_id_0: '',
  to_trigger_order_id_1: '',
  to_cancel_order_id_0: '',
  block_height: 1,
  timestamp: 1_700_000_000,
  created_at: 1_700_000_000,
  updated_at: 1_700_000_000,
  transaction_time: 1_700_000_000_000_000,
  ...overrides,
})

describe('mapStatusReason (Lighter)', () => {
  it('returns undefined for filled', () => {
    expect(mapStatusReason('filled')).toBeUndefined()
  })

  it('returns undefined for open', () => {
    expect(mapStatusReason('open')).toBeUndefined()
  })

  it('returns undefined for pending', () => {
    expect(mapStatusReason('pending')).toBeUndefined()
  })

  it('returns undefined for unknown statuses', () => {
    expect(mapStatusReason('something-new')).toBeUndefined()
  })

  it('maps canceled', () => {
    expect(mapStatusReason('canceled')).toBe('Order cancelled.')
  })

  it('maps canceled-post-only', () => {
    expect(mapStatusReason('canceled-post-only')).toBe(
      'Order cancelled: post-only order would have crossed the book.'
    )
  })

  it('maps canceled-reduce-only', () => {
    expect(mapStatusReason('canceled-reduce-only')).toBe(
      'Order cancelled: would not reduce your position.'
    )
  })

  it('maps canceled-position-not-allowed', () => {
    expect(mapStatusReason('canceled-position-not-allowed')).toBe(
      'Order cancelled: position not allowed.'
    )
  })

  it('maps canceled-margin-not-allowed', () => {
    expect(mapStatusReason('canceled-margin-not-allowed')).toBe(
      'Order cancelled: insufficient margin.'
    )
  })

  it('maps canceled-too-much-slippage', () => {
    expect(mapStatusReason('canceled-too-much-slippage')).toBe(
      'Order cancelled: slippage exceeded tolerance.'
    )
  })

  it('maps canceled-not-enough-liquidity', () => {
    expect(mapStatusReason('canceled-not-enough-liquidity')).toBe(
      'Order cancelled: not enough liquidity to fill.'
    )
  })

  it('maps canceled-self-trade', () => {
    expect(mapStatusReason('canceled-self-trade')).toBe(
      'Order cancelled: would self-trade against your own resting order.'
    )
  })

  it('maps canceled-expired', () => {
    expect(mapStatusReason('canceled-expired')).toBe('Order expired.')
  })

  it('maps canceled-oco', () => {
    expect(mapStatusReason('canceled-oco')).toBe(
      'Order cancelled: sibling OCO order filled or cancelled first.'
    )
  })

  it('maps canceled-child', () => {
    expect(mapStatusReason('canceled-child')).toBe(
      'Order cancelled: parent order was cancelled.'
    )
  })

  it('maps canceled-liquidation', () => {
    expect(mapStatusReason('canceled-liquidation')).toBe(
      'Order cancelled: account was liquidated.'
    )
  })

  it('maps canceled-invalid-balance', () => {
    expect(mapStatusReason('canceled-invalid-balance')).toBe(
      'Order cancelled: invalid balance.'
    )
  })
})

describe('mapOrderDetail (Lighter) — statusReason wiring', () => {
  it('populates statusReason from the raw status on terminal cancels', () => {
    const order = mapOrderDetail(
      baseOrder({ status: 'canceled-too-much-slippage' }),
      MARKET
    )
    expect(order.status).toBe(OrderStatus.CANCELLED)
    expect(order.statusReason).toBe(
      'Order cancelled: slippage exceeded tolerance.'
    )
  })

  it('omits statusReason for filled orders', () => {
    const order = mapOrderDetail(baseOrder({ status: 'filled' }), MARKET)
    expect(order.status).toBe(OrderStatus.FILLED)
    expect(order.statusReason).toBeUndefined()
  })

  it('omits statusReason for open orders', () => {
    const order = mapOrderDetail(baseOrder({ status: 'open' }), MARKET)
    expect(order.status).toBe(OrderStatus.OPEN)
    expect(order.statusReason).toBeUndefined()
  })

  it('omits statusReason for pending orders', () => {
    const order = mapOrderDetail(baseOrder({ status: 'pending' }), MARKET)
    expect(order.status).toBe(OrderStatus.PENDING)
    expect(order.statusReason).toBeUndefined()
  })
})

describe('mapOrder (Lighter) — OpenOrder sizes', () => {
  it('reads both sizes straight off the payload for a partial fill', () => {
    const order = mapOrder(
      baseOrder({
        status: 'open',
        initial_base_amount: '2',
        remaining_base_amount: '0.5',
        filled_base_amount: '1.5',
      }),
      MARKET
    )
    expect(order.originalSize).toBe('2')
    expect(order.remainingSize).toBe('0.5')
    expect(order.filledSize).toBe('1.5')
  })

  it('keeps remainingSize equal to originalSize on an untouched order', () => {
    const order = mapOrder(
      baseOrder({
        status: 'open',
        initial_base_amount: '2',
        remaining_base_amount: '2',
        filled_base_amount: '0',
      }),
      MARKET
    )
    expect(order.originalSize).toBe('2')
    expect(order.remainingSize).toBe('2')
    expect(order.filledSize).toBe('0')
  })

  it('maps the remaining open-order fields', () => {
    expect(
      mapOrder(
        baseOrder({
          status: 'open',
          remaining_base_amount: '0.5',
          filled_base_amount: '0.5',
        }),
        MARKET
      )
    ).toEqual({
      orderId: '1',
      market: MARKET,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      originalSize: '1',
      remainingSize: '0.5',
      price: '2000',
      filledSize: '0.5',
      reduceOnly: false,
      createdAt: '2023-11-14T22:13:20.000Z',
    })
  })
})
