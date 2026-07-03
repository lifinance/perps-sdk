import type { MarketDisplay } from '@lifi/perps-types'
import {
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { OnOrder } from '../types/wire.js'
import {
  classifyAndMapOrders,
  isTriggerOrder,
  mapOrder,
  mapOrderDetail,
  mapOrderStatus,
  mapOrderType,
  mapStatusReason,
  mapTriggerOrder,
} from './mapOrder.js'

const MARKET: MarketDisplay = {
  providerId: 'ondo',
  id: 'AAPL-USD.P',
  categoryId: 'ondo',
  baseAsset: {
    providerId: 'ondo',
    id: 'AAPL',
    displaySymbol: 'AAPL',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'ondo',
    id: 'USD',
    displaySymbol: 'USD',
    logoURI: '',
  },
}

const orderFixture = (overrides?: Partial<OnOrder>): OnOrder => ({
  orderId: 'ord-1',
  side: 'buy',
  price: '200.5',
  size: '10',
  market: 'AAPL-USD.P',
  filledSize: '4',
  lastFillSize: '4',
  filledCost: '802',
  fee: '0.4',
  status: 'open',
  createdAt: '2026-07-01T12:00:00Z',
  type: 'limit',
  timeInForce: 'GTC',
  reduceOnly: false,
  ...overrides,
})

describe('mapOrderType', () => {
  it('maps the Ondo order-type enum', () => {
    expect(mapOrderType('limit')).toBe(OrderType.LIMIT)
    expect(mapOrderType('market')).toBe(OrderType.MARKET)
    expect(mapOrderType('stopMarket')).toBe(OrderType.STOP_MARKET)
    expect(mapOrderType('takeProfitMarket')).toBe(OrderType.TAKE_PROFIT_MARKET)
  })
})

describe('mapOrderStatus', () => {
  it('maps the Ondo status enum', () => {
    expect(mapOrderStatus('open')).toBe(OrderStatus.OPEN)
    expect(mapOrderStatus('pending')).toBe(OrderStatus.PENDING)
    expect(mapOrderStatus('fullyfilled')).toBe(OrderStatus.FILLED)
    expect(mapOrderStatus('canceled')).toBe(OrderStatus.CANCELLED)
  })

  it('treats untriggered stop orders as active (OPEN)', () => {
    expect(mapOrderStatus('untriggered')).toBe(OrderStatus.OPEN)
  })
})

describe('mapStatusReason', () => {
  it('describes cancel reasons in plain English', () => {
    expect(
      mapStatusReason(
        orderFixture({ status: 'canceled', cancelReason: 'liquidation' })
      )
    ).toBe('Order cancelled: position was liquidated.')
    expect(
      mapStatusReason(
        orderFixture({
          status: 'canceled',
          cancelReason: 'selfMatchPrevention',
        })
      )
    ).toBe('Order cancelled: would self-match against your own resting order.')
    expect(
      mapStatusReason(
        orderFixture({ status: 'canceled', cancelReason: 'immediateOrCancel' })
      )
    ).toBe('Order cancelled: immediate-or-cancel remainder.')
  })

  it('falls back to a generic sentence for a plain cancellation', () => {
    expect(mapStatusReason(orderFixture({ status: 'canceled' }))).toBe(
      'Order cancelled.'
    )
    expect(
      mapStatusReason(orderFixture({ status: 'canceled', cancelReason: '' }))
    ).toBe('Order cancelled.')
  })

  it('returns undefined for non-cancelled statuses', () => {
    expect(mapStatusReason(orderFixture({ status: 'open' }))).toBeUndefined()
    expect(
      mapStatusReason(orderFixture({ status: 'fullyfilled' }))
    ).toBeUndefined()
  })
})

describe('isTriggerOrder', () => {
  it('classifies stop and take-profit orders as triggers', () => {
    expect(isTriggerOrder(orderFixture({ type: 'stopMarket' }))).toBe(true)
    expect(isTriggerOrder(orderFixture({ type: 'takeProfitMarket' }))).toBe(
      true
    )
  })

  it('classifies via stopOrderType and triggerPrice even when type lags', () => {
    expect(isTriggerOrder(orderFixture({ stopOrderType: 'stopLoss' }))).toBe(
      true
    )
    expect(isTriggerOrder(orderFixture({ triggerPrice: '190' }))).toBe(true)
  })

  it('classifies plain limit and market orders as non-triggers', () => {
    expect(isTriggerOrder(orderFixture())).toBe(false)
    expect(isTriggerOrder(orderFixture({ type: 'market' }))).toBe(false)
  })
})

describe('mapOrder', () => {
  it('maps an open limit order', () => {
    expect(mapOrder(orderFixture(), MARKET)).toEqual({
      orderId: 'ord-1',
      market: MARKET,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      size: '10',
      price: '200.5',
      filledSize: '4',
      reduceOnly: false,
      createdAt: '2026-07-01T12:00:00.000Z',
    })
  })

  it('defaults an absent reduceOnly to false and maps sell side', () => {
    const mapped = mapOrder(
      orderFixture({ side: 'sell', reduceOnly: undefined }),
      MARKET
    )
    expect(mapped.side).toBe(OrderSide.SELL)
    expect(mapped.reduceOnly).toBe(false)
  })
})

describe('mapTriggerOrder', () => {
  it('maps a stop-market order with its trigger price', () => {
    const mapped = mapTriggerOrder(
      orderFixture({
        type: 'stopMarket',
        stopOrderType: 'stopLoss',
        triggerPrice: '190',
      }),
      MARKET
    )
    expect(mapped).toEqual({
      orderId: 'ord-1',
      market: MARKET,
      type: OrderType.STOP_MARKET,
      size: '10',
      triggerPrice: '190',
      createdAt: '2026-07-01T12:00:00.000Z',
    })
  })
})

describe('classifyAndMapOrders', () => {
  it('buckets actives into open vs trigger and collects terminal ids', () => {
    const orders = [
      orderFixture(),
      orderFixture({
        orderId: 'ord-2',
        type: 'stopMarket',
        status: 'untriggered',
        triggerPrice: '190',
      }),
      orderFixture({ orderId: 'ord-3', status: 'canceled' }),
      orderFixture({ orderId: 'ord-4', status: 'fullyfilled' }),
    ]
    const { openOrders, triggerOrders, terminated } = classifyAndMapOrders(
      orders,
      () => MARKET
    )
    expect(openOrders.map((o) => o.orderId)).toEqual(['ord-1'])
    expect(triggerOrders.map((o) => o.orderId)).toEqual(['ord-2'])
    expect(terminated).toEqual(['ord-3', 'ord-4'])
  })

  it('skips orders whose market the resolver does not know', () => {
    const { openOrders } = classifyAndMapOrders(
      [orderFixture()],
      () => undefined
    )
    expect(openOrders).toEqual([])
  })
})

describe('mapOrderDetail', () => {
  it('maps the rich Order shape with derived remaining size and average price', () => {
    expect(mapOrderDetail(orderFixture(), MARKET)).toEqual({
      orderId: 'ord-1',
      market: MARKET,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: '200.5',
      originalSize: '10',
      remainingSize: '6',
      filledSize: '4',
      timeInForce: TimeInForce.GTC,
      reduceOnly: false,
      isTrigger: false,
      status: OrderStatus.OPEN,
      averagePrice: '200.5',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-01T12:00:00.000Z',
    })
  })

  it('carries the cancel transition into statusReason and updatedAt', () => {
    const mapped = mapOrderDetail(
      orderFixture({
        status: 'canceled',
        cancelReason: 'liquidation',
        canceledAt: '2026-07-01T13:00:00Z',
      }),
      MARKET
    )
    expect(mapped.status).toBe(OrderStatus.CANCELLED)
    expect(mapped.statusReason).toBe(
      'Order cancelled: position was liquidated.'
    )
    expect(mapped.updatedAt).toBe('2026-07-01T13:00:00.000Z')
  })

  it('marks trigger orders and omits averagePrice when nothing filled', () => {
    const mapped = mapOrderDetail(
      orderFixture({
        type: 'stopMarket',
        status: 'untriggered',
        triggerPrice: '190',
        filledSize: '0',
        filledCost: '0',
        timeInForce: undefined,
      }),
      MARKET
    )
    expect(mapped.isTrigger).toBe(true)
    expect(mapped.triggerPrice).toBe('190')
    expect(mapped.averagePrice).toBeUndefined()
    expect(mapped.timeInForce).toBeUndefined()
    expect(mapped.remainingSize).toBe('10')
  })
})
