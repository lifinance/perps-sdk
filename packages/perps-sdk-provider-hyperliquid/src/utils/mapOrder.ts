import type { OpenOrder, Order, TriggerOrder } from '@lifi/perps-types'
import {
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
} from '@lifi/perps-types'
import type { HlFrontendOpenOrder, HlOrderDetail } from '../types/index.js'
import { marketDisplayFromCoin } from './deriveMarket.js'

/** Map a Hyperliquid orderType string to the OrderType enum. */
export const mapOrderType = (orderType: string): OrderType => {
  switch (orderType) {
    case 'Take Profit Market':
      return OrderType.TAKE_PROFIT_MARKET
    case 'Take Profit Limit':
      return OrderType.TAKE_PROFIT_LIMIT
    case 'Stop Market':
      return OrderType.STOP_MARKET
    case 'Stop Limit':
      return OrderType.STOP_LIMIT
    case 'Market':
      return OrderType.MARKET
    default:
      return OrderType.LIMIT
  }
}

export const isTriggerType = (type: OrderType): boolean =>
  type === OrderType.TAKE_PROFIT_MARKET ||
  type === OrderType.TAKE_PROFIT_LIMIT ||
  type === OrderType.STOP_MARKET ||
  type === OrderType.STOP_LIMIT

/**
 * Decide whether a raw Hyperliquid order belongs in the cross-provider
 * `triggerOrders` bucket. Single source of truth for both the REST
 * `getOrders` path (`HlFrontendOpenOrder` payload) and the `orderUpdates`
 * WS handler (`HlOrderDetail.order`, a strict subset).
 *
 * Authoritative signals, in order:
 *   1. `isTrigger` — REST-only boolean Hyperliquid sets on
 *      `frontendOpenOrders`. Definitive when present.
 *   2. `isPositionTpsl` — REST-only flag for TP/SL legs attached to a
 *      position.
 *   3. `triggerCondition !== 'N/A'` — present on both REST and WS payloads.
 *      Non-trigger orders carry the literal `'N/A'`.
 *   4. `triggerPx` non-null and non-zero — present on both. The reliable
 *      trigger signal on the WS wire when `orderType` lies (HL pushes
 *      `'Limit'` for a freshly-placed TP/SL until REST refetch lands the
 *      corrected type).
 *   5. `orderType` — final fall-back via `isTriggerType`.
 */
export const isTriggerOrder = (
  o: HlFrontendOpenOrder | HlOrderDetail['order']
): boolean => {
  if ('isTrigger' in o && o.isTrigger === true) {
    return true
  }
  if ('isPositionTpsl' in o && o.isPositionTpsl === true) {
    return true
  }
  if (o.triggerCondition && o.triggerCondition !== 'N/A') {
    return true
  }
  if (
    o.triggerPx != null &&
    o.triggerPx !== '' &&
    parseFloat(o.triggerPx) > 0
  ) {
    return true
  }
  return isTriggerType(mapOrderType(o.orderType))
}

export const mapOpenOrder = (o: HlFrontendOpenOrder): OpenOrder => ({
  orderId: String(o.oid),
  market: marketDisplayFromCoin(o.coin),
  side: o.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
  type: mapOrderType(o.orderType),
  size: o.sz,
  price: o.limitPx,
  filledSize: o.origSz
    ? (parseFloat(o.origSz) - parseFloat(o.sz)).toString()
    : '0',
  reduceOnly: o.reduceOnly ?? false,
  label: o.isTrigger ? o.triggerCondition : undefined,
  createdAt: new Date(o.timestamp).toISOString(),
})

export const mapTriggerOrder = (o: HlFrontendOpenOrder): TriggerOrder => {
  const type = mapOrderType(o.orderType)
  const isLimit =
    type === OrderType.TAKE_PROFIT_LIMIT || type === OrderType.STOP_LIMIT
  return {
    orderId: String(o.oid),
    market: marketDisplayFromCoin(o.coin),
    type,
    size: o.sz,
    triggerPrice: o.triggerPx,
    ...(isLimit ? { limitPrice: o.limitPx } : {}),
    label: o.triggerCondition,
    createdAt: new Date(o.timestamp).toISOString(),
  }
}

export const mapOrderStatus = (status: string): OrderStatus => {
  switch (status) {
    case 'open':
    case 'resting':
      return OrderStatus.OPEN
    case 'filled':
      return OrderStatus.FILLED
    case 'canceled':
    case 'cancelled':
      return OrderStatus.CANCELLED
    case 'rejected':
      return OrderStatus.REJECTED
    case 'triggered':
      return OrderStatus.TRIGGERED
    case 'marginCanceled':
      return OrderStatus.CANCELLED
    default:
      return OrderStatus.PENDING
  }
}

/**
 * Map a raw Hyperliquid order status to a short English sentence
 * describing *why* the order ended in a terminal non-FILLED state. Bare
 * `canceled`/`cancelled`/`rejected` carry no actionable detail and
 * return `undefined`; so do non-terminal and unknown values.
 */
export const mapStatusReason = (status: string): string | undefined => {
  switch (status) {
    case 'iocCanceled':
      return 'Order cancelled: not enough liquidity to fill immediately.'
    case 'reduceOnlyCanceled':
      return 'Order cancelled: would not reduce your position.'
    case 'marginCanceled':
      return 'Order cancelled: insufficient margin.'
    case 'liquidatedCanceled':
      return 'Order cancelled: account was liquidated.'
    case 'siblingFilledCanceled':
      return 'Order cancelled: sibling OCO order filled first.'
    case 'selfTradeCanceled':
      return 'Order cancelled: would self-trade against your own resting order.'
    case 'tickRejected':
      return 'Order rejected: price did not match the tick size.'
    case 'minTradeNtlRejected':
      return 'Order rejected: notional value below the minimum trade size.'
    case 'delistedRejected':
      return 'Order rejected: market has been delisted.'
    default:
      return undefined
  }
}

const mapTimeInForce = (tif: string | undefined): TimeInForce | undefined => {
  switch (tif) {
    case 'Gtc':
      return TimeInForce.GTC
    case 'Ioc':
      return TimeInForce.IOC
    case 'Alo':
      return TimeInForce.POST_ONLY
    default:
      return undefined
  }
}

export const mapOrder = (detail: HlOrderDetail): Order => {
  const o = detail.order
  const filled = parseFloat(o.origSz) - parseFloat(o.sz)

  return {
    orderId: String(o.oid),
    market: marketDisplayFromCoin(o.coin),
    side: o.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
    type: mapOrderType(o.orderType),
    price: o.limitPx,
    originalSize: o.origSz,
    remainingSize: o.sz,
    filledSize: filled.toString(),
    timeInForce: mapTimeInForce(o.tif ?? undefined),
    reduceOnly: o.reduceOnly ?? undefined,
    isTrigger: o.triggerCondition !== undefined && o.triggerCondition !== 'N/A',
    triggerPrice: o.triggerPx ?? undefined,
    status: mapOrderStatus(detail.status),
    statusReason: mapStatusReason(detail.status),
    createdAt: new Date(o.timestamp).toISOString(),
    updatedAt: new Date(detail.statusTimestamp).toISOString(),
  }
}
