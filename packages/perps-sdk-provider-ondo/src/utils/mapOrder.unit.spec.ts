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
import type { OndoOrder, OndoTwapOrder } from '../types/wire.js'
import { mapOrder, mapOrderUpdates } from './mapOrder.js'

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
const orderFixture = (overrides: Partial<OndoOrder> = {}): OndoOrder => ({
  orderId: 'ord-1',
  side: 'buy',
  price: '200.5',
  size: '10',
  market: MARKET.id,
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
const twapFixture = (
  overrides: Partial<OndoTwapOrder> = {}
): OndoTwapOrder => ({
  twapId: 'twap-1',
  market: MARKET.id,
  side: 'sell',
  startTime: '2026-07-01T12:00:00Z',
  runningTime: 1800,
  frequency: 60,
  avgFilledPrice: '200.5',
  filledSize: '4',
  totalSize: '10',
  totalFees: '0.4',
  orderStatus: 'running',
  reduceOnly: true,
  ...overrides,
})

describe('mapOrder', () => {
  it('maps the partial fill quantities, lifecycle and average price', () => {
    expect(mapOrder(orderFixture(), MARKET)).toEqual({
      orderId: 'ord-1',
      market: MARKET,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      originalSize: '10',
      remainingSize: '6',
      filledSize: '4',
      price: '200.5',
      timeInForce: TimeInForce.GTC,
      reduceOnly: false,
      status: OrderStatus.PARTIALLY_FILLED,
      averagePrice: '200.5',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-01T12:00:00.000Z',
    })
  })
  it('preserves venue, client and parent ids independently', () => {
    expect(
      mapOrder(
        orderFixture({ clientOrderId: 'client-1', parentOrderId: 'parent-1' }),
        MARKET
      )
    ).toMatchObject({
      orderId: 'ord-1',
      clientOrderId: 'client-1',
      parentOrderId: 'parent-1',
    })
    const absent = mapOrder(orderFixture(), MARKET)
    expect(absent).not.toHaveProperty('clientOrderId')
    expect(absent).not.toHaveProperty('parentOrderId')
    expect(absent).not.toHaveProperty('explorerLink')
  })
  it('keeps precise fractional sizes and detects subnormal partial fills', () => {
    expect(
      mapOrder(orderFixture({ size: '0.3', filledSize: '0.1' }), MARKET)
        .remainingSize
    ).toBe('0.2')
    expect(
      mapOrder(orderFixture({ filledSize: '1e-400' }), MARKET).status
    ).toBe(OrderStatus.PARTIALLY_FILLED)
    const unfilled = mapOrder(
      orderFixture({ size: '10.00', filledSize: '0.00' }),
      MARKET
    )
    expect(unfilled.originalSize).toBe(unfilled.remainingSize)
    expect(unfilled.status).toBe(OrderStatus.OPEN)
    expect(unfilled).not.toHaveProperty('averagePrice')
  })
  it('maps market execution to IOC when the venue omits timeInForce', () => {
    expect(
      mapOrder(orderFixture({ type: 'market', timeInForce: undefined }), MARKET)
    ).toMatchObject({ type: OrderType.MARKET, timeInForce: TimeInForce.IOC })
  })
  it('rejects an unsupported timeInForce instead of reporting none', () => {
    const raw: OndoOrder = JSON.parse(
      JSON.stringify({ ...orderFixture(), timeInForce: 'FOK' })
    )
    expect(() => mapOrder(raw, MARKET)).toThrow(PerpsError)
  })
  it.each([
    ['takeProfit', 'sell', TriggerCondition.ABOVE],
    ['takeProfit', 'buy', TriggerCondition.BELOW],
    ['stopLoss', 'sell', TriggerCondition.BELOW],
    ['stopLoss', 'buy', TriggerCondition.ABOVE],
  ] as const)('derives %s %s trigger condition', (stopOrderType, side, triggerCondition) => {
    const mapped = mapOrder(
      orderFixture({
        type: 'market',
        stopOrderType,
        side,
        triggerPrice: '190',
        filledSize: '0',
        status: 'untriggered',
      }),
      MARKET
    )
    expect(mapped).toMatchObject({
      type:
        stopOrderType === 'takeProfit'
          ? OrderType.TAKE_PROFIT_MARKET
          : OrderType.STOP_MARKET,
      triggerPrice: '190',
      triggerCondition,
      status: OrderStatus.OPEN,
    })
    expect(mapped).not.toHaveProperty('price')
    expect(mapped).not.toHaveProperty('timeInForce')
    expect(mapped).not.toHaveProperty('parentOrderId')
  })
  it.each([
    ['stopLoss', OrderType.STOP_LIMIT],
    ['takeProfit', OrderType.TAKE_PROFIT_LIMIT],
  ] as const)('maps %s limit triggers with a separate limit price', (stopOrderType, type) => {
    expect(
      mapOrder(
        orderFixture({
          stopOrderType,
          triggerPrice: '190',
          parentOrderId: 'parent-1',
        }),
        MARKET
      )
    ).toMatchObject({
      type,
      triggerPrice: '190',
      limitPrice: '200.5',
      parentOrderId: 'parent-1',
    })
  })
  it.each([
    ['stopMarket', OrderType.STOP_MARKET],
    ['takeProfitMarket', OrderType.TAKE_PROFIT_MARKET],
  ] as const)('uses the %s type when stopOrderType is absent', (type, expected) => {
    expect(
      mapOrder(orderFixture({ type, triggerPrice: '190' }), MARKET).type
    ).toBe(expected)
  })
  it('rejects a trigger without its price or direction', () => {
    expect(() =>
      mapOrder(orderFixture({ type: 'stopMarket' }), MARKET)
    ).toThrow(PerpsError)
    expect(() =>
      mapOrder(orderFixture({ triggerPrice: '190' }), MARKET)
    ).toThrow(PerpsError)
  })
  it('maps a pending order to PENDING', () => {
    expect(
      mapOrder(orderFixture({ status: 'pending', filledSize: '0' }), MARKET)
        .status
    ).toBe(OrderStatus.PENDING)
  })
  it('rejects an unsupported order status', () => {
    const raw: OndoOrder = JSON.parse(
      JSON.stringify({ ...orderFixture(), status: 'unknown' })
    )
    expect(() => mapOrder(raw, MARKET)).toThrow(PerpsError)
  })
  it('keeps the venue cancellation reason and transition time', () => {
    expect(
      mapOrder(
        orderFixture({
          status: 'canceled',
          cancelReason: 'liquidation',
          canceledAt: '2026-07-01T13:00:00Z',
        }),
        MARKET
      )
    ).toMatchObject({
      status: OrderStatus.CANCELLED,
      statusReason: 'liquidation',
      updatedAt: '2026-07-01T13:00:00.000Z',
    })
    expect(
      mapOrder(orderFixture({ status: 'canceled' }), MARKET)
    ).not.toHaveProperty('statusReason')
    expect(
      mapOrder(
        orderFixture({
          status: 'fullyfilled',
          filledSize: '10',
          filledAt: '2026-07-01T13:00:00Z',
        }),
        MARKET
      )
    ).toMatchObject({
      status: OrderStatus.FILLED,
      remainingSize: '0',
      updatedAt: '2026-07-01T13:00:00.000Z',
    })
  })
  it('maps running and completed TWAPs through the same order mapper', () => {
    expect(mapOrder(twapFixture(), MARKET)).toMatchObject({
      orderId: 'twap-1',
      type: OrderType.TWAP,
      status: OrderStatus.PARTIALLY_FILLED,
      originalSize: '10',
      remainingSize: '6',
      filledSize: '4',
      averagePrice: '200.5',
      reduceOnly: true,
      durationSeconds: 1800,
      startedAt: '2026-07-01T12:00:00.000Z',
    })
    const unfilled = mapOrder(twapFixture({ filledSize: '0' }), MARKET)
    expect(unfilled.status).toBe(OrderStatus.OPEN)
    expect(unfilled).not.toHaveProperty('averagePrice')
    expect(
      mapOrder(
        twapFixture({
          orderStatus: 'completed',
          filledSize: '10',
          finishTime: '2026-07-01T12:30:00Z',
        }),
        MARKET
      )
    ).toMatchObject({
      status: OrderStatus.FILLED,
      remainingSize: '0',
      updatedAt: '2026-07-01T12:30:00.000Z',
    })
    expect(
      mapOrder(
        twapFixture({ orderStatus: 'cancelled', twapCancelReason: 2 }),
        MARKET
      )
    ).toMatchObject({ status: OrderStatus.CANCELLED, statusReason: '2' })
    expect(() =>
      mapOrder(twapFixture({ orderStatus: 'unexpected' }), MARKET)
    ).toThrow(PerpsError)
  })
})

describe('mapOrderUpdates', () => {
  it('includes terminal rows and their ids in the order event', () => {
    const result = mapOrderUpdates(
      [
        orderFixture(),
        orderFixture({
          orderId: 'trigger',
          type: 'stopMarket',
          triggerPrice: '190',
          status: 'untriggered',
          filledSize: '0',
        }),
        orderFixture({ orderId: 'cancelled', status: 'canceled' }),
        orderFixture({ orderId: 'filled', status: 'fullyfilled' }),
      ],
      () => MARKET
    )
    expect(result.orders.map((order) => order.orderId)).toEqual([
      'ord-1',
      'trigger',
      'cancelled',
      'filled',
    ])
    expect(result.terminated).toEqual(['cancelled', 'filled'])
  })
  it('skips unknown markets', () => {
    expect(mapOrderUpdates([orderFixture()], () => undefined)).toEqual({
      orders: [],
      terminated: [],
    })
  })
  it('retires a terminal row whose market it cannot resolve', () => {
    expect(
      mapOrderUpdates(
        [orderFixture({ orderId: 'cancelled', status: 'canceled' })],
        () => undefined
      )
    ).toEqual({ orders: [], terminated: ['cancelled'] })
  })
  it('drops an unmappable row and keeps the rest of the frame', () => {
    const unmappable: OndoOrder = JSON.parse(
      JSON.stringify({
        ...orderFixture({ orderId: 'unmappable' }),
        status: 'unknown',
      })
    )
    expect(
      mapOrderUpdates(
        [
          unmappable,
          orderFixture({ orderId: 'cancelled', status: 'canceled' }),
        ],
        () => MARKET
      )
    ).toEqual({
      orders: [expect.objectContaining({ orderId: 'cancelled' })],
      terminated: ['cancelled'],
    })
  })
})
