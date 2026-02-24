import {
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
} from '../../../enums.js'
import type { OpenOrder } from '../../../account.js'
import type { Order } from '../../../trading.js'
import type { HlFrontendOpenOrder, HlOrderDetail } from '../types.js'

import { resolveAssetIdFromLookup } from './shared.js'

export const mapOpenOrder = (
  o: HlFrontendOpenOrder,
  dexKey: string,
  assetIdLookup: Map<string, number>
): OpenOrder => ({
  id: String(o.oid),
  symbol: o.coin,
  assetId: resolveAssetIdFromLookup(assetIdLookup, o.coin),
  dex: dexKey,
  side: o.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
  type: o.orderType === 'Limit' ? OrderType.LIMIT : OrderType.MARKET,
  size: o.sz,
  price: o.limitPx,
  filledSize: o.origSz
    ? (parseFloat(o.origSz) - parseFloat(o.sz)).toString()
    : '0',
  reduceOnly: o.reduceOnly ?? false,
  createdAt: new Date(o.timestamp).toISOString(),
})

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
    symbol: o.coin,
    side: o.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
    type: o.orderType === 'Limit' ? OrderType.LIMIT : OrderType.MARKET,
    price: o.limitPx,
    originalSize: o.origSz,
    remainingSize: o.sz,
    filledSize: filled.toString(),
    timeInForce: mapTimeInForce(o.tif ?? undefined),
    reduceOnly: o.reduceOnly ?? undefined,
    isTrigger: o.triggerCondition !== undefined && o.triggerCondition !== 'N/A',
    triggerPrice: o.triggerPx ?? undefined,
    status: mapOrderStatus(detail.status),
    createdAt: new Date(o.timestamp).toISOString(),
    updatedAt: new Date(detail.statusTimestamp).toISOString(),
  }
}
