import {
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
} from '../../../enums.js'
import type { OpenOrder } from '../../../account.js'
import type { TriggerOrderInput } from '../../../action.js'
import type { Order } from '../../../action.js'
import type { HlFrontendOpenOrder, HlOrderDetail } from '../types.js'

import { resolveAssetIdFromLookup } from './shared.js'

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

const isTpType = (type: OrderType): boolean =>
  type === OrderType.TAKE_PROFIT_MARKET || type === OrderType.TAKE_PROFIT_LIMIT

const isSlType = (type: OrderType): boolean =>
  type === OrderType.STOP_MARKET || type === OrderType.STOP_LIMIT

const buildTriggerInput = (o: HlFrontendOpenOrder): TriggerOrderInput => {
  const type = mapOrderType(o.orderType)
  const isLimit =
    type === OrderType.TAKE_PROFIT_LIMIT || type === OrderType.STOP_LIMIT
  return {
    triggerPrice: o.triggerPx,
    ...(isLimit ? { limitPrice: o.limitPx } : {}),
  }
}

const extractChildTriggers = (
  children: HlFrontendOpenOrder[]
): { takeProfit?: TriggerOrderInput; stopLoss?: TriggerOrderInput } => {
  let takeProfit: TriggerOrderInput | undefined
  let stopLoss: TriggerOrderInput | undefined

  for (const child of children) {
    const childType = mapOrderType(child.orderType)
    if (isTpType(childType)) {
      takeProfit = buildTriggerInput(child)
    } else if (isSlType(childType)) {
      stopLoss = buildTriggerInput(child)
    }
  }

  return { takeProfit, stopLoss }
}

export const mapOpenOrder = (
  o: HlFrontendOpenOrder,
  providerKey: string,
  assetIdLookup: Map<string, number>
): OpenOrder => {
  const type = mapOrderType(o.orderType)
  const isTp = isTpType(type)
  const isSl = isSlType(type)

  const childTriggers =
    o.children.length > 0 ? extractChildTriggers(o.children) : undefined

  return {
    id: String(o.oid),
    symbol: o.coin,
    assetId: resolveAssetIdFromLookup(assetIdLookup, o.coin),
    provider: providerKey,
    side: o.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
    type,
    size: o.sz,
    price: o.limitPx,
    filledSize: o.origSz
      ? (parseFloat(o.origSz) - parseFloat(o.sz)).toString()
      : '0',
    reduceOnly: o.reduceOnly ?? false,
    label: o.isTrigger ? o.triggerCondition : undefined,
    takeProfit: isTp ? buildTriggerInput(o) : childTriggers?.takeProfit,
    stopLoss: isSl ? buildTriggerInput(o) : childTriggers?.stopLoss,
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
    createdAt: new Date(o.timestamp).toISOString(),
    updatedAt: new Date(detail.statusTimestamp).toISOString(),
  }
}
