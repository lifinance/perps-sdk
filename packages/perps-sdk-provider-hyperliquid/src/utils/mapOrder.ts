import type { OpenOrder, Order, TriggerOrder } from '@lifi/perps-types'
import {
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
} from '@lifi/perps-types'
import type { HlFrontendOpenOrder, HlOrderDetail } from '../types/index.js'
import { deriveMarket } from './deriveMarket.js'

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

export const mapOpenOrder = (o: HlFrontendOpenOrder): OpenOrder => ({
  id: String(o.oid),
  asset: {
    assetId: o.coin,
    market: deriveMarket(o.coin),
    displaySymbol: o.coin,
    displayQuote: null,
  },
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
    id: String(o.oid),
    asset: {
      assetId: o.coin,
      market: deriveMarket(o.coin),
      displaySymbol: o.coin,
      displayQuote: null,
    },
    type,
    size: o.sz,
    triggerPrice: o.triggerPx,
    ...(isLimit ? { limitPrice: o.limitPx } : {}),
    label: o.triggerCondition,
    createdAt: new Date(o.timestamp).toISOString(),
  }
}

const mapOrderStatus = (status: string): OrderStatus => {
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
    asset: {
      assetId: o.coin,
      market: deriveMarket(o.coin),
      displaySymbol: o.coin,
      displayQuote: null,
    },
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
