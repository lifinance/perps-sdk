import { isActiveOrderStatus } from '@lifi/perps-sdk'
import type { MarketDisplay } from '@lifi/perps-types'
import { OrderSide, OrderStatus, OrderType } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { HlFrontendOpenOrder, HlOrderDetail } from '../types/index.js'
import {
  isTriggerOrder,
  mapOpenOrder,
  mapOrder,
  mapOrderStatus,
  mapStatusReason,
  mapTriggerOrder,
} from './mapOrder.js'

const baseDetail = (
  overrides: Partial<HlOrderDetail> = {},
  orderOverrides: Partial<HlOrderDetail['order']> = {}
): HlOrderDetail => ({
  order: {
    oid: 1,
    coin: 'ETH',
    side: 'B',
    sz: '0',
    limitPx: '1000',
    orderType: 'Limit',
    origSz: '1',
    reduceOnly: false,
    timestamp: 1_700_000_000_000,
    tif: 'Gtc',
    cloid: null,
    triggerCondition: 'N/A',
    triggerPx: null,
    ...orderOverrides,
  },
  status: 'filled',
  statusTimestamp: 1_700_000_000_000,
  ...overrides,
})

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

describe('mapStatusReason (Hyperliquid)', () => {
  it('returns undefined for filled', () => {
    expect(mapStatusReason('filled')).toBeUndefined()
  })

  it('returns undefined for open', () => {
    expect(mapStatusReason('open')).toBeUndefined()
  })

  it('returns undefined for resting', () => {
    expect(mapStatusReason('resting')).toBeUndefined()
  })

  it('returns undefined for triggered', () => {
    expect(mapStatusReason('triggered')).toBeUndefined()
  })

  it('returns undefined for bare canceled (no actionable detail)', () => {
    expect(mapStatusReason('canceled')).toBeUndefined()
  })

  it('returns undefined for bare cancelled (no actionable detail)', () => {
    expect(mapStatusReason('cancelled')).toBeUndefined()
  })

  it('returns undefined for bare rejected (no actionable detail)', () => {
    expect(mapStatusReason('rejected')).toBeUndefined()
  })

  it('returns undefined for unknown statuses', () => {
    expect(mapStatusReason('somethingNew')).toBeUndefined()
  })

  it('maps iocCancelRejected', () => {
    expect(mapStatusReason('iocCancelRejected')).toBe(
      'Order cancelled: not enough liquidity to fill immediately.'
    )
  })

  it('maps reduceOnlyCanceled', () => {
    expect(mapStatusReason('reduceOnlyCanceled')).toBe(
      'Order cancelled: would not reduce your position.'
    )
  })

  it('maps marginCanceled', () => {
    expect(mapStatusReason('marginCanceled')).toBe(
      'Order cancelled: insufficient margin.'
    )
  })

  it('maps liquidatedCanceled', () => {
    expect(mapStatusReason('liquidatedCanceled')).toBe(
      'Order cancelled: account was liquidated.'
    )
  })

  it('maps siblingFilledCanceled', () => {
    expect(mapStatusReason('siblingFilledCanceled')).toBe(
      'Order cancelled: sibling OCO order filled first.'
    )
  })

  it('maps selfTradeCanceled', () => {
    expect(mapStatusReason('selfTradeCanceled')).toBe(
      'Order cancelled: would self-trade against your own resting order.'
    )
  })

  it('maps tickRejected', () => {
    expect(mapStatusReason('tickRejected')).toBe(
      'Order rejected: price did not match the tick size.'
    )
  })

  it('maps minTradeNtlRejected', () => {
    expect(mapStatusReason('minTradeNtlRejected')).toBe(
      'Order rejected: notional value below the minimum trade size.'
    )
  })

  it('maps delistedCanceled', () => {
    expect(mapStatusReason('delistedCanceled')).toBe(
      'Order cancelled: market has been delisted.'
    )
  })

  it('maps scheduledCancel', () => {
    expect(mapStatusReason('scheduledCancel')).toBe(
      "Order cancelled: dead man's switch triggered."
    )
  })

  it('maps perpMarginRejected', () => {
    expect(mapStatusReason('perpMarginRejected')).toBe(
      'Order rejected: insufficient margin.'
    )
  })

  it('maps reduceOnlyRejected', () => {
    expect(mapStatusReason('reduceOnlyRejected')).toBe(
      'Order rejected: would not reduce your position.'
    )
  })

  it('maps badAloPxRejected', () => {
    expect(mapStatusReason('badAloPxRejected')).toBe(
      'Order rejected: post-only order would have matched immediately.'
    )
  })

  it('maps badTriggerPxRejected', () => {
    expect(mapStatusReason('badTriggerPxRejected')).toBe(
      'Order rejected: invalid take-profit/stop-loss trigger price.'
    )
  })

  it('maps marketOrderNoLiquidityRejected', () => {
    expect(mapStatusReason('marketOrderNoLiquidityRejected')).toBe(
      'Order rejected: not enough liquidity for the market order.'
    )
  })

  it('maps oracleRejected', () => {
    expect(mapStatusReason('oracleRejected')).toBe(
      'Order rejected: price too far from the oracle price.'
    )
  })

  it('maps vaultWithdrawalCanceled', () => {
    expect(mapStatusReason('vaultWithdrawalCanceled')).toBe(
      'Order cancelled: a vault withdrawal occurred.'
    )
  })

  it('maps openInterestCapCanceled', () => {
    expect(mapStatusReason('openInterestCapCanceled')).toBe(
      'Order cancelled: too aggressive while open interest was at its cap.'
    )
  })

  it('maps positionIncreaseAtOpenInterestCapRejected', () => {
    expect(mapStatusReason('positionIncreaseAtOpenInterestCapRejected')).toBe(
      'Order rejected: open interest is at its cap.'
    )
  })

  it('maps positionFlipAtOpenInterestCapRejected', () => {
    expect(mapStatusReason('positionFlipAtOpenInterestCapRejected')).toBe(
      'Order rejected: open interest is at its cap.'
    )
  })

  it('maps tooAggressiveAtOpenInterestCapRejected', () => {
    expect(mapStatusReason('tooAggressiveAtOpenInterestCapRejected')).toBe(
      'Order rejected: price too aggressive while open interest was at its cap.'
    )
  })

  it('maps openInterestIncreaseRejected', () => {
    expect(mapStatusReason('openInterestIncreaseRejected')).toBe(
      'Order rejected: open interest is at its cap.'
    )
  })

  it('maps insufficientSpotBalanceRejected', () => {
    expect(mapStatusReason('insufficientSpotBalanceRejected')).toBe(
      'Order rejected: insufficient spot balance.'
    )
  })

  it('maps perpMaxPositionRejected', () => {
    expect(mapStatusReason('perpMaxPositionRejected')).toBe(
      'Order rejected: exceeds the maximum position size for the current leverage tier.'
    )
  })
})

describe('mapOrderStatus (Hyperliquid)', () => {
  it.each([
    ['siblingFilledCanceled', OrderStatus.CANCELLED],
    ['scheduledCancel', OrderStatus.CANCELLED],
    ['liquidatedCanceled', OrderStatus.CANCELLED],
    ['selfTradeCanceled', OrderStatus.CANCELLED],
    ['reduceOnlyCanceled', OrderStatus.CANCELLED],
    ['vaultWithdrawalCanceled', OrderStatus.CANCELLED],
    ['openInterestCapCanceled', OrderStatus.CANCELLED],
    ['delistedCanceled', OrderStatus.CANCELLED],
    ['marginCanceled', OrderStatus.CANCELLED],
    ['tickRejected', OrderStatus.REJECTED],
    ['minTradeNtlRejected', OrderStatus.REJECTED],
    ['perpMarginRejected', OrderStatus.REJECTED],
    ['reduceOnlyRejected', OrderStatus.REJECTED],
    ['badAloPxRejected', OrderStatus.REJECTED],
    ['iocCancelRejected', OrderStatus.REJECTED],
    ['badTriggerPxRejected', OrderStatus.REJECTED],
    ['marketOrderNoLiquidityRejected', OrderStatus.REJECTED],
    ['oracleRejected', OrderStatus.REJECTED],
  ])('maps documented terminal status %s to %s, not PENDING', (raw, expected) => {
    const mapped = mapOrderStatus(raw)
    expect(mapped).toBe(expected)
    expect(isActiveOrderStatus(mapped)).toBe(false)
  })

  it('maps an unrecognized future status to PENDING (documented fallback)', () => {
    expect(mapOrderStatus('someBrandNewStatus')).toBe(OrderStatus.PENDING)
  })

  it('keeps mapOrderStatus and mapStatusReason consistent for every status mapStatusReason recognizes', () => {
    const reasonedStatuses = [
      'iocCancelRejected',
      'reduceOnlyCanceled',
      'marginCanceled',
      'liquidatedCanceled',
      'siblingFilledCanceled',
      'selfTradeCanceled',
      'scheduledCancel',
      'tickRejected',
      'minTradeNtlRejected',
      'delistedCanceled',
      'perpMarginRejected',
      'reduceOnlyRejected',
      'badAloPxRejected',
      'badTriggerPxRejected',
      'marketOrderNoLiquidityRejected',
      'oracleRejected',
      'vaultWithdrawalCanceled',
      'openInterestCapCanceled',
      'positionIncreaseAtOpenInterestCapRejected',
      'positionFlipAtOpenInterestCapRejected',
      'tooAggressiveAtOpenInterestCapRejected',
      'openInterestIncreaseRejected',
      'insufficientSpotBalanceRejected',
      'perpMaxPositionRejected',
    ]
    for (const status of reasonedStatuses) {
      expect(mapStatusReason(status)).toBeDefined()
      expect(isActiveOrderStatus(mapOrderStatus(status))).toBe(false)
    }
  })
})

describe('mapOrder (Hyperliquid) — statusReason wiring', () => {
  it('populates statusReason from the raw status on specific cancels', () => {
    const order = mapOrder(baseDetail({ status: 'iocCancelRejected' }), MARKET)
    expect(order.status).toBe(OrderStatus.REJECTED)
    expect(order.statusReason).toBe(
      'Order cancelled: not enough liquidity to fill immediately.'
    )
  })

  it('maps siblingFilledCanceled to a terminal CANCELLED status with a reason', () => {
    const order = mapOrder(
      baseDetail({ status: 'siblingFilledCanceled' }),
      MARKET
    )
    expect(order.status).toBe(OrderStatus.CANCELLED)
    expect(order.statusReason).toBe(
      'Order cancelled: sibling OCO order filled first.'
    )
  })

  it('populates statusReason for marginCanceled while keeping status CANCELLED', () => {
    const order = mapOrder(baseDetail({ status: 'marginCanceled' }), MARKET)
    expect(order.status).toBe(OrderStatus.CANCELLED)
    expect(order.statusReason).toBe('Order cancelled: insufficient margin.')
  })

  it('omits statusReason for filled orders', () => {
    const order = mapOrder(baseDetail({ status: 'filled' }), MARKET)
    expect(order.status).toBe(OrderStatus.FILLED)
    expect(order.statusReason).toBeUndefined()
  })

  it('omits statusReason for open orders', () => {
    const order = mapOrder(baseDetail({ status: 'open' }), MARKET)
    expect(order.status).toBe(OrderStatus.OPEN)
    expect(order.statusReason).toBeUndefined()
  })

  it('omits statusReason for bare canceled (no actionable detail)', () => {
    const order = mapOrder(baseDetail({ status: 'canceled' }), MARKET)
    expect(order.status).toBe(OrderStatus.CANCELLED)
    expect(order.statusReason).toBeUndefined()
  })

  it('omits statusReason for bare rejected (no actionable detail)', () => {
    const order = mapOrder(baseDetail({ status: 'rejected' }), MARKET)
    expect(order.status).toBe(OrderStatus.REJECTED)
    expect(order.statusReason).toBeUndefined()
  })
})

const baseOpenOrder = (
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

describe('mapOpenOrder (Hyperliquid)', () => {
  it('carries both sizes for a partially filled order', () => {
    const order = mapOpenOrder(baseOpenOrder(), MARKET)
    expect(order.originalSize).toBe('2.0')
    expect(order.remainingSize).toBe('1.5')
    expect(order.filledSize).toBe('0.5')
  })

  it('keeps remainingSize equal to originalSize on an untouched order', () => {
    const order = mapOpenOrder(
      baseOpenOrder({ sz: '2.0', origSz: '2.0' }),
      MARKET
    )
    expect(order.originalSize).toBe('2.0')
    expect(order.remainingSize).toBe('2.0')
    expect(order.filledSize).toBe('0')
  })

  it('maps the remaining open-order fields', () => {
    expect(mapOpenOrder(baseOpenOrder(), MARKET)).toEqual({
      orderId: '77',
      market: MARKET,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      originalSize: '2.0',
      remainingSize: '1.5',
      price: '3000.0',
      filledSize: '0.5',
      reduceOnly: false,
      createdAt: '2023-11-14T22:13:20.000Z',
    })
  })
})

const baseWsOrder = (
  overrides: Partial<HlOrderDetail['order']> = {}
): HlOrderDetail['order'] => baseDetail({}, overrides).order

describe('mapOpenOrder (Hyperliquid) — WebSocket payload', () => {
  it('maps an order that carries no isTrigger flag', () => {
    expect(
      mapOpenOrder(baseWsOrder({ oid: 88, sz: '0.4', origSz: '1' }), MARKET)
    ).toEqual({
      orderId: '88',
      market: MARKET,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      originalSize: '1',
      remainingSize: '0.4',
      price: '1000',
      filledSize: '0.6',
      reduceOnly: false,
      label: undefined,
      createdAt: '2023-11-14T22:13:20.000Z',
    })
  })
})

describe('mapTriggerOrder (Hyperliquid)', () => {
  it('maps a REST trigger order and keeps the limit price on a limit type', () => {
    expect(
      mapTriggerOrder(
        baseOpenOrder({
          orderType: 'Stop Limit',
          isTrigger: true,
          triggerCondition: 'Stop Loss',
          triggerPx: '2900.0',
        }),
        MARKET
      )
    ).toEqual({
      orderId: '77',
      market: MARKET,
      type: OrderType.STOP_LIMIT,
      size: '1.5',
      triggerPrice: '2900.0',
      limitPrice: '3000.0',
      label: 'Stop Loss',
      createdAt: '2023-11-14T22:13:20.000Z',
    })
  })

  it('maps a WebSocket trigger order and omits the limit price on a market type', () => {
    expect(
      mapTriggerOrder(
        baseWsOrder({
          oid: 99,
          orderType: 'Stop Market',
          triggerCondition: 'Stop Loss',
          triggerPx: '2900.0',
        }),
        MARKET
      )
    ).toEqual({
      orderId: '99',
      market: MARKET,
      type: OrderType.STOP_MARKET,
      size: '0',
      triggerPrice: '2900.0',
      label: 'Stop Loss',
      createdAt: '2023-11-14T22:13:20.000Z',
    })
  })

  it('falls back to a zero trigger price when the WebSocket payload omits one', () => {
    expect(
      mapTriggerOrder(baseWsOrder({ orderType: 'Stop Market' }), MARKET)
        .triggerPrice
    ).toBe('0')
  })
})

describe('isTriggerOrder (Hyperliquid)', () => {
  it('reads the REST isTrigger flag', () => {
    expect(isTriggerOrder(baseOpenOrder({ isTrigger: true }))).toBe(true)
  })

  it('reads a WebSocket trigger condition when no isTrigger flag exists', () => {
    expect(
      isTriggerOrder(baseWsOrder({ triggerCondition: 'Take Profit' }))
    ).toBe(true)
  })

  it('reads a WebSocket trigger price when the order type still says Limit', () => {
    expect(isTriggerOrder(baseWsOrder({ triggerPx: '2900.0' }))).toBe(true)
  })

  it('leaves a plain WebSocket limit order out of the trigger bucket', () => {
    expect(isTriggerOrder(baseWsOrder())).toBe(false)
  })
})
