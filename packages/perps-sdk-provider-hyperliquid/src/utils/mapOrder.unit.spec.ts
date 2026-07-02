import { isActiveOrderStatus } from '@lifi/perps-sdk'
import { OrderStatus } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { HlOrderDetail } from '../types/index.js'
import { mapOrder, mapOrderStatus, mapStatusReason } from './mapOrder.js'

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
    ]
    for (const status of reasonedStatuses) {
      expect(mapStatusReason(status)).toBeDefined()
      expect(isActiveOrderStatus(mapOrderStatus(status))).toBe(false)
    }
  })
})

describe('mapOrder (Hyperliquid) — statusReason wiring', () => {
  it('populates statusReason from the raw status on specific cancels', () => {
    const order = mapOrder(baseDetail({ status: 'iocCancelRejected' }))
    expect(order.status).toBe(OrderStatus.REJECTED)
    expect(order.statusReason).toBe(
      'Order cancelled: not enough liquidity to fill immediately.'
    )
  })

  it('maps siblingFilledCanceled to a terminal CANCELLED status with a reason', () => {
    const order = mapOrder(baseDetail({ status: 'siblingFilledCanceled' }))
    expect(order.status).toBe(OrderStatus.CANCELLED)
    expect(order.statusReason).toBe(
      'Order cancelled: sibling OCO order filled first.'
    )
  })

  it('populates statusReason for marginCanceled while keeping status CANCELLED', () => {
    const order = mapOrder(baseDetail({ status: 'marginCanceled' }))
    expect(order.status).toBe(OrderStatus.CANCELLED)
    expect(order.statusReason).toBe('Order cancelled: insufficient margin.')
  })

  it('omits statusReason for filled orders', () => {
    const order = mapOrder(baseDetail({ status: 'filled' }))
    expect(order.status).toBe(OrderStatus.FILLED)
    expect(order.statusReason).toBeUndefined()
  })

  it('omits statusReason for open orders', () => {
    const order = mapOrder(baseDetail({ status: 'open' }))
    expect(order.status).toBe(OrderStatus.OPEN)
    expect(order.statusReason).toBeUndefined()
  })

  it('omits statusReason for bare canceled (no actionable detail)', () => {
    const order = mapOrder(baseDetail({ status: 'canceled' }))
    expect(order.status).toBe(OrderStatus.CANCELLED)
    expect(order.statusReason).toBeUndefined()
  })

  it('omits statusReason for bare rejected (no actionable detail)', () => {
    const order = mapOrder(baseDetail({ status: 'rejected' }))
    expect(order.status).toBe(OrderStatus.REJECTED)
    expect(order.statusReason).toBeUndefined()
  })
})
