import { PerpsError } from '@lifi/perps-sdk'
import {
  type MarketDisplay,
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
  TriggerCondition,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { LtOrder } from '../types/index.js'
import { mapOrder, mapOrderUpdates } from './mapOrder.js'

const MARKET: MarketDisplay = {
  providerId: 'lighter',
  id: '1',
  categoryId: 'lighter',
  baseAsset: {
    providerId: 'lighter',
    id: '1',
    displaySymbol: 'ETH',
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
  remaining_base_amount: '1',
  is_ask: false,
  filled_base_amount: '0',
  filled_quote_amount: '0',
  side: 'buy',
  type: 'limit',
  time_in_force: 'good-till-time',
  reduce_only: false,
  trigger_price: '0',
  order_expiry: 1_700_000_900_000,
  status: 'open',
  trigger_status: 'na',
  trigger_time: 0,
  parent_order_index: 0,
  parent_order_id: '',
  to_trigger_order_id_0: '',
  to_trigger_order_id_1: '',
  to_cancel_order_id_0: '',
  block_height: 1,
  timestamp: 1_700_000_000,
  created_at: 1_700_000_000,
  updated_at: 1_700_000_001,
  transaction_time: 1_700_000_000_000_000,
  ...overrides,
})

describe('mapOrder (Lighter)', () => {
  it('separates the venue id and client id and omits an absent client id', () => {
    const order = mapOrder(baseOrder({ client_order_index: 77 }), MARKET)
    expect(order.orderId).toBe('1')
    expect(order.clientOrderId).toBe('77')
    expect(mapOrder(baseOrder(), MARKET)).not.toHaveProperty('clientOrderId')
    expect(order).not.toHaveProperty('explorerLink')
  })

  it('maps a parent-dependent trigger with its parent id', () => {
    expect(
      mapOrder(
        baseOrder({
          type: 'stop-loss',
          trigger_price: '1900',
          trigger_status: 'parent-order',
          parent_order_id: '42',
        }),
        MARKET
      )
    ).toMatchObject({ status: OrderStatus.PENDING, parentOrderId: '42' })
    expect(
      mapOrder(baseOrder({ type: 'stop-loss', reduce_only: true }), MARKET)
    ).not.toHaveProperty('parentOrderId')
  })

  it.each([
    [
      'take-profit',
      false,
      OrderType.TAKE_PROFIT_MARKET,
      TriggerCondition.BELOW,
    ],
    ['take-profit', true, OrderType.TAKE_PROFIT_MARKET, TriggerCondition.ABOVE],
    ['stop-loss', false, OrderType.STOP_MARKET, TriggerCondition.ABOVE],
    ['stop-loss', true, OrderType.STOP_MARKET, TriggerCondition.BELOW],
    [
      'take-profit-limit',
      false,
      OrderType.TAKE_PROFIT_LIMIT,
      TriggerCondition.BELOW,
    ],
    [
      'take-profit-limit',
      true,
      OrderType.TAKE_PROFIT_LIMIT,
      TriggerCondition.ABOVE,
    ],
    ['stop-loss-limit', false, OrderType.STOP_LIMIT, TriggerCondition.ABOVE],
    ['stop-loss-limit', true, OrderType.STOP_LIMIT, TriggerCondition.BELOW],
  ])('derives the condition for %s with is_ask=%s', (type, is_ask, expectedType, triggerCondition) => {
    const order = mapOrder(
      baseOrder({ type, is_ask, trigger_price: '2100' }),
      MARKET
    )
    expect(order).toMatchObject({
      type: expectedType,
      triggerCondition,
      triggerPrice: '2100',
    })
    if (type.endsWith('-limit')) {
      expect(order).toHaveProperty('limitPrice', '2000')
    } else {
      expect(order).not.toHaveProperty('limitPrice')
    }
  })

  it.each([
    ['pending', OrderStatus.PENDING],
    ['in-progress', OrderStatus.PENDING],
    ['open', OrderStatus.OPEN],
    ['triggered', OrderStatus.TRIGGERED],
    ['filled', OrderStatus.FILLED],
    ['canceled', OrderStatus.CANCELLED],
    ['canceled-expired', OrderStatus.EXPIRED],
    ['canceled-too-much-slippage', OrderStatus.CANCELLED],
  ])('maps the %s lifecycle', (status, expected) => {
    const order = mapOrder(baseOrder({ status }), MARKET)
    expect(order.status).toBe(expected)
    expect(order.statusReason).toBe(
      expected === OrderStatus.CANCELLED ? status : undefined
    )
  })

  it.each([
    'unknown',
    'in_progress',
    'canceled-unknown',
  ])('rejects the undocumented status %s', (status) => {
    expect(() => mapOrder(baseOrder({ status }), MARKET)).toThrow(PerpsError)
  })

  it('does not restore a cancelled parent-dependent trigger to pending', () => {
    expect(
      mapOrder(
        baseOrder({ status: 'canceled-child', trigger_status: 'parent-order' }),
        MARKET
      ).status
    ).toBe(OrderStatus.CANCELLED)
  })

  it('compares partial fills without numeric underflow', () => {
    expect(
      mapOrder(
        baseOrder({
          filled_base_amount: '1e-400',
          filled_quote_amount: '2e-397',
        }),
        MARKET
      )
    ).toMatchObject({
      status: OrderStatus.PARTIALLY_FILLED,
      filledSize: '1e-400',
      averagePrice: '2000',
    })
  })

  it('retains decimal sizes and maps regular order execution fields', () => {
    expect(
      mapOrder(
        baseOrder({
          remaining_base_amount: '0.5',
          filled_base_amount: '0.5',
          filled_quote_amount: '1000',
        }),
        MARKET
      )
    ).toEqual({
      orderId: '1',
      market: MARKET,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      status: OrderStatus.PARTIALLY_FILLED,
      originalSize: '1',
      remainingSize: '0.5',
      filledSize: '0.5',
      averagePrice: '2000',
      price: '2000',
      timeInForce: TimeInForce.GTT,
      expiresAt: '2023-11-14T22:28:20.000Z',
      reduceOnly: false,
      createdAt: '2023-11-14T22:13:20.000Z',
      updatedAt: '2023-11-14T22:13:21.000Z',
    })
  })

  it.each([
    'immediate-or-cancel',
    'post-only',
  ])('maps time in force %s', (time_in_force) => {
    expect(mapOrder(baseOrder({ time_in_force }), MARKET)).toHaveProperty(
      'timeInForce',
      time_in_force === 'post-only' ? TimeInForce.POST_ONLY : TimeInForce.IOC
    )
  })

  it('rejects an unrepresentable time in force', () => {
    expect(() =>
      mapOrder(baseOrder({ time_in_force: 'Unknown' }), MARKET)
    ).toThrow(PerpsError)
  })

  it.each([
    'open',
    'filled',
  ])('maps a %s TWAP through the order mapper', (status) => {
    const mapped = mapOrder(baseOrder({ type: 'twap', status }), MARKET)
    expect(mapped).toMatchObject({
      orderId: '1',
      type: OrderType.TWAP,
      durationSeconds: 900,
      startedAt: '2023-11-14T22:13:20.000Z',
    })
    expect(mapped).not.toHaveProperty('averagePrice')
  })

  it('maps a TWAP child as a regular order with its parent', () => {
    expect(
      mapOrder(baseOrder({ type: 'twap-sub', parent_order_id: '8' }), MARKET)
    ).toMatchObject({ type: OrderType.LIMIT, parentOrderId: '8' })
  })

  it.each([
    'market',
    'liquidation',
  ])('maps regular execution type %s without a fabricated expiry', (type) => {
    const mapped = mapOrder(baseOrder({ type, order_expiry: 0 }), MARKET)
    expect(mapped.type).toBe(OrderType.MARKET)
    expect(mapped).not.toHaveProperty('expiresAt')
  })

  it('rejects an unrepresentable order type', () => {
    expect(() => mapOrder(baseOrder({ type: 'unknown' }), MARKET)).toThrow(
      PerpsError
    )
  })

  it('accepts underscore spellings from older Lighter payloads', () => {
    expect(
      mapOrder(
        baseOrder({ type: 'stop_loss_limit', time_in_force: 'good_till_time' }),
        MARKET
      )
    ).toMatchObject({
      type: OrderType.STOP_LIMIT,
      triggerCondition: TriggerCondition.ABOVE,
    })
  })
})

describe('mapOrderUpdates (Lighter)', () => {
  it('retains terminal rows and their eviction ids with active and trigger rows', () => {
    const result = mapOrderUpdates(
      [
        baseOrder(),
        baseOrder({ order_index: 2, status: 'filled' }),
        baseOrder({
          order_index: 3,
          type: 'take-profit',
          trigger_status: 'parent-order',
          parent_order_id: '1',
        }),
      ],
      () => MARKET
    )
    expect(
      result.orders.map(({ orderId, status }) => [orderId, status])
    ).toEqual([
      ['1', OrderStatus.OPEN],
      ['2', OrderStatus.FILLED],
      ['3', OrderStatus.PENDING],
    ])
    expect(result.terminated).toEqual(['2'])
  })

  it('emits a pre-book row and keeps it out of the eviction ids', () => {
    expect(
      mapOrderUpdates([baseOrder({ status: 'pending' })], () => MARKET)
    ).toEqual({
      orders: [
        expect.objectContaining({
          orderId: '1',
          status: OrderStatus.PENDING,
        }),
      ],
      terminated: [],
    })
  })

  it('skips rows with no registered market but retains terminal eviction ids', () => {
    expect(
      mapOrderUpdates(
        [baseOrder(), baseOrder({ order_index: 2, status: 'filled' })],
        () => undefined
      )
    ).toEqual({ orders: [], terminated: ['2'] })
  })
})
