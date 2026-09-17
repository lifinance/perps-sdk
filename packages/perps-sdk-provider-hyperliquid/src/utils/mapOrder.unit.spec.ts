import { PerpsError } from '@lifi/perps-sdk'
import type { MarketDisplay } from '@lifi/perps-types'
import {
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
  TriggerCondition,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type {
  HlFrontendOpenOrder,
  HlOrderDetail,
  HlTwapHistoryEntry,
} from '../types/index.js'
import { mapOrder } from './mapOrder.js'

const MARKET: MarketDisplay = {
  providerId: 'hyperliquid',
  id: 'ETH',
  categoryId: 'hyperliquid',
  baseAsset: {
    providerId: 'hyperliquid',
    id: 'ETH',
    displaySymbol: 'ETH',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: '',
  },
}
const raw = (
  overrides: Partial<HlFrontendOpenOrder> = {}
): HlFrontendOpenOrder => ({
  oid: 77,
  coin: 'ETH',
  side: 'B',
  sz: '1.5',
  limitPx: '3000.0',
  orderType: 'Limit',
  origSz: '2.0',
  reduceOnly: false,
  timestamp: 1_700_000_000_000,
  isTrigger: false,
  isPositionTpsl: false,
  triggerCondition: 'N/A',
  triggerPx: '0.0',
  tif: 'Gtc',
  cloid: null,
  ...overrides,
})
const detail = (status: string): HlOrderDetail => ({
  order: raw(),
  status,
  statusTimestamp: 1_700_000_001_000,
})

describe('mapOrder', () => {
  it('preserves exact sizes and derives a partial fill without floating point loss', () => {
    expect(
      mapOrder(raw({ origSz: '1.000000000000000001', sz: '1' }), MARKET)
    ).toMatchObject({
      orderId: '77',
      originalSize: '1.000000000000000001',
      remainingSize: '1',
      filledSize: '0.000000000000000001',
      status: OrderStatus.PARTIALLY_FILLED,
      type: OrderType.LIMIT,
      timeInForce: TimeInForce.GTC,
    })
  })
  it('keeps both venue and client ids and omits a null client id', () => {
    expect(mapOrder(raw({ cloid: '0x1234' }), MARKET)).toMatchObject({
      orderId: '77',
      clientOrderId: '0x1234',
    })
    expect(mapOrder(raw(), MARKET)).not.toHaveProperty('clientOrderId')
    expect(mapOrder(raw(), MARKET)).not.toHaveProperty('explorerLink')
  })
  it.each([
    ['tp', 'A', 'Market', OrderType.TAKE_PROFIT_MARKET, TriggerCondition.ABOVE],
    ['tp', 'B', 'Market', OrderType.TAKE_PROFIT_MARKET, TriggerCondition.BELOW],
    ['sl', 'A', 'Market', OrderType.STOP_MARKET, TriggerCondition.BELOW],
    ['sl', 'B', 'Market', OrderType.STOP_MARKET, TriggerCondition.ABOVE],
    ['tp', 'A', 'Limit', OrderType.TAKE_PROFIT_LIMIT, TriggerCondition.ABOVE],
    ['tp', 'B', 'Limit', OrderType.TAKE_PROFIT_LIMIT, TriggerCondition.BELOW],
    ['sl', 'A', 'Limit', OrderType.STOP_LIMIT, TriggerCondition.BELOW],
    ['sl', 'B', 'Limit', OrderType.STOP_LIMIT, TriggerCondition.ABOVE],
  ] as const)('derives %s/%s/%s trigger direction', (tpsl, side, orderType, type, triggerCondition) => {
    const order = mapOrder(
      raw({ isTrigger: true, orderType, tpsl, side, triggerPx: '2900' }),
      MARKET
    )
    expect(order).toMatchObject({
      type,
      triggerCondition,
      triggerPrice: '2900',
    })
    if (orderType === 'Limit') {
      expect(order).toHaveProperty('limitPrice', '3000.0')
    } else {
      expect(order).not.toHaveProperty('limitPrice')
    }
  })
  it.each([
    'Stop Loss',
    'Take Profit',
    'N/A',
  ])('ignores legacy trigger prose %s', (triggerCondition) => {
    expect(
      mapOrder(
        raw({
          orderType: 'Limit',
          isTrigger: true,
          tpsl: 'sl',
          triggerPx: '2900',
          triggerCondition,
        }),
        MARKET
      )
    ).toMatchObject({
      type: OrderType.STOP_LIMIT,
      triggerCondition: TriggerCondition.ABOVE,
      limitPrice: '3000.0',
    })
  })
  it('reads trigger types from an order detail without frontend flags', () => {
    const order: HlOrderDetail = detail('triggered')
    order.order = {
      ...order.order,
      isTrigger: undefined,
      orderType: 'Take Profit Limit',
      triggerPx: '3200',
    }
    expect(mapOrder(order, MARKET)).toMatchObject({
      type: OrderType.TAKE_PROFIT_LIMIT,
      status: OrderStatus.TRIGGERED,
      triggerCondition: TriggerCondition.BELOW,
    })
  })
  it('sets PENDING only on attached children', () => {
    expect(
      mapOrder(raw({ orderType: 'Stop Market', isTrigger: true }), MARKET, '12')
    ).toMatchObject({ parentOrderId: '12', status: OrderStatus.PENDING })
    expect(mapOrder(raw({ sz: '2.0' }), MARKET).status).toBe(OrderStatus.OPEN)
  })
  it.each([
    ['open', OrderStatus.PARTIALLY_FILLED],
    ['filled', OrderStatus.FILLED],
    ['triggered', OrderStatus.TRIGGERED],
    ['canceled', OrderStatus.CANCELLED],
    ['siblingFilledCanceled', OrderStatus.CANCELLED],
    ['scheduledCancel', OrderStatus.CANCELLED],
    ['tickRejected', OrderStatus.REJECTED],
    ['rejected', OrderStatus.REJECTED],
  ])('maps lifecycle %s', (status, expected) => {
    const order = mapOrder(detail(status), MARKET)
    expect(order.status).toBe(expected)
    expect(order.updatedAt).toBe('2023-11-14T22:13:21.000Z')
    if (
      expected === OrderStatus.CANCELLED ||
      expected === OrderStatus.REJECTED
    ) {
      expect(order.statusReason).toBe(status)
    } else {
      expect(order.statusReason).toBeUndefined()
    }
  })
  it.each([
    'unrecognized',
    'unrecognizedCanceled',
    'unrecognizedRejected',
  ])('rejects unknown status %s', (status) => {
    expect(() => mapOrder(detail(status), MARKET)).toThrow(PerpsError)
  })
  it('rejects a trigger with no documented type discriminator', () => {
    expect(() => mapOrder(raw({ isTrigger: true }), MARKET)).toThrow(PerpsError)
  })
  it('rejects an unknown execution type or time-in-force', () => {
    expect(() => mapOrder(raw({ orderType: 'unexpected' }), MARKET)).toThrow(
      PerpsError
    )
    expect(() => mapOrder(raw({ tif: 'unexpected' }), MARKET)).toThrow(
      PerpsError
    )
  })
  it.each([
    ['Gtc', OrderType.LIMIT, TimeInForce.GTC],
    ['Ioc', OrderType.LIMIT, TimeInForce.IOC],
    ['Alo', OrderType.LIMIT, TimeInForce.POST_ONLY],
    ['FrontendMarket', OrderType.MARKET, TimeInForce.IOC],
    ['LiquidationMarket', OrderType.MARKET, TimeInForce.IOC],
  ] as const)('maps %s time-in-force', (tif, type, timeInForce) => {
    expect(
      mapOrder(
        raw({ tif, orderType: type === OrderType.MARKET ? 'Market' : 'Limit' }),
        MARKET
      )
    ).toMatchObject({ type, timeInForce })
  })
  it.each([
    ['activated', OrderStatus.PARTIALLY_FILLED],
    ['finished', OrderStatus.FILLED],
    ['terminated', OrderStatus.CANCELLED],
    ['stopped', OrderStatus.CANCELLED],
    ['waitingForTrigger', OrderStatus.OPEN],
    ['error', OrderStatus.REJECTED],
  ])('maps TWAP lifecycle %s', (status, expected) => {
    const entry: HlTwapHistoryEntry = {
      twapId: 5,
      time: 1_700_000_002,
      state: {
        coin: 'ETH',
        side: 'B',
        sz: '2',
        executedSz: '0.5',
        executedNtl: '1500',
        minutes: 10,
        reduceOnly: false,
        timestamp: 1_700_000_000_000,
      },
      status: { status, description: 'venue reason' },
    }
    expect(mapOrder(entry, MARKET)).toMatchObject({
      orderId: '5',
      type: OrderType.TWAP,
      originalSize: '2',
      remainingSize: '1.5',
      filledSize: '0.5',
      averagePrice: '3000',
      durationSeconds: 600,
      side: OrderSide.BUY,
      status: expected,
      startedAt: '2023-11-14T22:13:20.000Z',
      updatedAt: '2023-11-14T22:13:22.000Z',
    })
  })
})
