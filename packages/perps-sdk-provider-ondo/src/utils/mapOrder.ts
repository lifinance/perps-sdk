import type {
  MarketDisplay,
  OpenOrder,
  Order,
  TriggerOrder,
} from '@lifi/perps-types'
import {
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
} from '@lifi/perps-types'
import Big from 'big.js'
import type {
  OndoOrder,
  OndoOrderStatus,
  OndoOrderType,
} from '../types/wire.js'

const toIso = (time: string): string => new Date(time).toISOString()

const mapSide = (side: OndoOrder['side']): OrderSide =>
  side === 'buy' ? OrderSide.BUY : OrderSide.SELL

/** @public */
export const mapOrderType = (type: OndoOrderType): OrderType => {
  switch (type) {
    case 'limit':
      return OrderType.LIMIT
    case 'market':
      return OrderType.MARKET
    case 'stopMarket':
      return OrderType.STOP_MARKET
    case 'takeProfitMarket':
      return OrderType.TAKE_PROFIT_MARKET
  }
}

/**
 * Map Ondo's order status onto the generic enum. `untriggered` stop orders
 * are active resting orders from the trader's point of view, so they map to
 * OPEN.
 * @public
 */
export const mapOrderStatus = (status: OndoOrderStatus): OrderStatus => {
  switch (status) {
    case 'open':
    case 'untriggered':
      return OrderStatus.OPEN
    case 'pending':
      return OrderStatus.PENDING
    case 'fullyfilled':
      return OrderStatus.FILLED
    case 'canceled':
      return OrderStatus.CANCELLED
  }
}

const CANCEL_REASON_SENTENCES: Record<string, string> = {
  liquidation: 'Order cancelled: position was liquidated.',
  selfMatchPrevention:
    'Order cancelled: would self-match against your own resting order.',
  immediateOrCancel: 'Order cancelled: immediate-or-cancel remainder.',
}

/**
 * Plain-English `statusReason` for a cancelled order; `undefined` for every
 * other status. Unknown wire reasons fall back to the generic sentence rather
 * than leaking raw enum values into the UI.
 * @public
 */
export const mapStatusReason = (order: OndoOrder): string | undefined => {
  if (order.status !== 'canceled') {
    return undefined
  }
  return CANCEL_REASON_SENTENCES[order.cancelReason ?? ''] ?? 'Order cancelled.'
}

/**
 * Whether an order rests on a trigger. Checks `stopOrderType` and
 * `triggerPrice` besides the type so a lagging `type` field cannot
 * misclassify a trigger as a plain order.
 * @public
 */
export const isTriggerOrder = (order: OndoOrder): boolean =>
  order.type === 'stopMarket' ||
  order.type === 'takeProfitMarket' ||
  order.stopOrderType !== undefined ||
  order.triggerPrice !== undefined

/**
 * Map an active non-trigger Ondo order to an {@link OpenOrder}. Ondo reports
 * the submitted and filled quantities only, so `remainingSize` is derived.
 * @public
 */
export const mapOrder = (
  order: OndoOrder,
  market: MarketDisplay
): OpenOrder => ({
  orderId: order.orderId,
  market,
  side: mapSide(order.side),
  type: mapOrderType(order.type),
  originalSize: order.size,
  remainingSize: new Big(order.size).minus(order.filledSize).toFixed(),
  price: order.price,
  filledSize: order.filledSize,
  reduceOnly: order.reduceOnly ?? false,
  createdAt: toIso(order.createdAt),
})

/** Map an active trigger Ondo order to a {@link TriggerOrder}. @public */
export const mapTriggerOrder = (
  order: OndoOrder,
  market: MarketDisplay
): TriggerOrder => ({
  orderId: order.orderId,
  market,
  type: mapOrderType(order.type),
  size: order.size,
  triggerPrice: order.triggerPrice ?? '0',
  createdAt: toIso(order.createdAt),
})

const TERMINAL_STATUSES: ReadonlySet<OndoOrderStatus> = new Set([
  'canceled',
  'fullyfilled',
])

/**
 * Bucket a venue order list into active open/trigger orders (mapped) and
 * terminal order ids. Orders whose market the resolver does not know are
 * skipped.
 * @public
 */
export const classifyAndMapOrders = (
  orders: OndoOrder[],
  resolveMarket: (market: string) => MarketDisplay | undefined
): {
  openOrders: OpenOrder[]
  triggerOrders: TriggerOrder[]
  terminated: string[]
} => {
  const openOrders: OpenOrder[] = []
  const triggerOrders: TriggerOrder[] = []
  const terminated: string[] = []
  for (const order of orders) {
    if (TERMINAL_STATUSES.has(order.status)) {
      terminated.push(order.orderId)
      continue
    }
    const market = resolveMarket(order.market)
    if (market === undefined) {
      continue
    }
    if (isTriggerOrder(order)) {
      triggerOrders.push(mapTriggerOrder(order, market))
    } else {
      openOrders.push(mapOrder(order, market))
    }
  }
  return { openOrders, triggerOrders, terminated }
}

/**
 * Map a single venue order onto the rich {@link Order} detail shape.
 * `remainingSize` and `averagePrice` are derived (`size − filledSize`,
 * `filledCost ÷ filledSize`); `updatedAt` is the latest transition timestamp
 * Ondo exposes, falling back to `createdAt`.
 * @public
 */
export const mapOrderDetail = (
  order: OndoOrder,
  market: MarketDisplay
): Order => {
  const filled = new Big(order.filledSize)
  const trigger = isTriggerOrder(order)
  return {
    orderId: order.orderId,
    market,
    side: mapSide(order.side),
    type: mapOrderType(order.type),
    price: order.price,
    originalSize: order.size,
    remainingSize: new Big(order.size).minus(filled).toFixed(),
    filledSize: order.filledSize,
    timeInForce:
      order.timeInForce === undefined
        ? undefined
        : TimeInForce[order.timeInForce],
    reduceOnly: order.reduceOnly ?? false,
    isTrigger: trigger,
    ...(trigger && order.triggerPrice !== undefined
      ? { triggerPrice: order.triggerPrice }
      : {}),
    status: mapOrderStatus(order.status),
    ...(mapStatusReason(order) !== undefined
      ? { statusReason: mapStatusReason(order) }
      : {}),
    ...(filled.gt(0)
      ? { averagePrice: new Big(order.filledCost).div(filled).toFixed() }
      : {}),
    createdAt: toIso(order.createdAt),
    updatedAt: toIso(order.canceledAt ?? order.filledAt ?? order.createdAt),
  }
}
