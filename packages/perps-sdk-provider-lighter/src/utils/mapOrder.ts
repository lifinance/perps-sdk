import { isActiveOrderStatus } from '@lifi/perps-sdk'
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
import type { LtOrder } from '../types/index.js'

// Lighter's `type` enum uses hyphens in the OpenAPI spec but earlier API
// versions emitted underscores. Tolerate both so we don't silently fall
// through to LIMIT for stop/take-profit orders.
const mapOrderType = (ltType: string): OrderType => {
  const normalized = ltType.replace(/-/g, '_')
  const map: Record<string, OrderType> = {
    limit: OrderType.LIMIT,
    market: OrderType.MARKET,
    stop_loss: OrderType.STOP_MARKET,
    stop_loss_limit: OrderType.STOP_LIMIT,
    take_profit: OrderType.TAKE_PROFIT_MARKET,
    take_profit_limit: OrderType.TAKE_PROFIT_LIMIT,
  }
  return map[normalized] ?? OrderType.LIMIT
}

const mapTimeInForce = (tif: string): TimeInForce | undefined => {
  switch (tif.replace(/-/g, '_')) {
    case 'good_till_time':
      return TimeInForce.GTT
    case 'immediate_or_cancel':
      return TimeInForce.IOC
    case 'post_only':
      return TimeInForce.POST_ONLY
    default:
      return undefined
  }
}

const mapOrderStatus = (status: string): OrderStatus => {
  if (
    status === 'open' ||
    status === 'in-progress' ||
    status === 'in_progress'
  ) {
    return OrderStatus.OPEN
  }
  if (status === 'pending') {
    return OrderStatus.PENDING
  }
  if (status === 'filled') {
    return OrderStatus.FILLED
  }
  if (status.startsWith('canceled')) {
    return OrderStatus.CANCELLED
  }
  return OrderStatus.OPEN
}

/**
 * Map a raw Lighter order status to a short English sentence describing
 * *why* the order ended in a terminal non-FILLED state. Non-terminal
 * statuses, plain `filled`, and unknown values return `undefined`.
 * @public
 */
export const mapStatusReason = (status: string): string | undefined => {
  switch (status) {
    case 'canceled':
      return 'Order cancelled.'
    case 'canceled-post-only':
      return 'Order cancelled: post-only order would have crossed the book.'
    case 'canceled-reduce-only':
      return 'Order cancelled: would not reduce your position.'
    case 'canceled-position-not-allowed':
      return 'Order cancelled: position not allowed.'
    case 'canceled-margin-not-allowed':
      return 'Order cancelled: insufficient margin.'
    case 'canceled-too-much-slippage':
      return 'Order cancelled: slippage exceeded tolerance.'
    case 'canceled-not-enough-liquidity':
      return 'Order cancelled: not enough liquidity to fill.'
    case 'canceled-self-trade':
      return 'Order cancelled: would self-trade against your own resting order.'
    case 'canceled-expired':
      return 'Order expired.'
    case 'canceled-oco':
      return 'Order cancelled: sibling OCO order filled or cancelled first.'
    case 'canceled-child':
      return 'Order cancelled: parent order was cancelled.'
    case 'canceled-liquidation':
      return 'Order cancelled: account was liquidated.'
    case 'canceled-invalid-balance':
      return 'Order cancelled: invalid balance.'
    default:
      return undefined
  }
}

/**
 * True for order types Lighter exposes as TP/SL legs. Mirrors the
 * Hyperliquid helper of the same name so the backend can split a raw
 * Lighter order list into the same `openOrders` / `triggerOrders`
 * buckets the SDK declares on `OrdersResponse`.
 * @public
 */
export const isTriggerType = (type: OrderType): boolean =>
  type === OrderType.TAKE_PROFIT_MARKET ||
  type === OrderType.TAKE_PROFIT_LIMIT ||
  type === OrderType.STOP_MARKET ||
  type === OrderType.STOP_LIMIT

/**
 * Decide whether a raw Lighter order belongs in the cross-provider
 * `triggerOrders` bucket. Single source of truth for both the REST
 * `getOrders` path and the `account_all_orders` WS handler.
 *
 * Authoritative signals, in order:
 *   1. `trigger_status` — Lighter's own enum. `'ready' | 'mark-price' |
 *      'parent-order'` all mean "this order has trigger semantics" (TP/SL
 *      waiting on price, or a TP/SL leg of a parent placeOrder). `'twap'`
 *      is intentionally excluded — TWAP child orders are scheduled resting
 *      limits, not TP/SL triggers. `'na'` is "regular order".
 *   2. `trigger_price > 0` — catches cases where `trigger_status`
 *      momentarily lags during state transitions (e.g. right after an OCO
 *      sibling cancels).
 *   3. `type` — final fallback via the mapped `OrderType`.
 * @public
 */
export const isTriggerOrder = (raw: LtOrder): boolean => {
  if (
    raw.trigger_status === 'ready' ||
    raw.trigger_status === 'mark-price' ||
    raw.trigger_status === 'parent-order'
  ) {
    return true
  }
  if (raw.trigger_price !== '' && parseFloat(raw.trigger_price) > 0) {
    return true
  }
  return isTriggerType(mapOrderType(raw.type))
}

/**
 * Map a raw Lighter trigger order (stop/take-profit, market or limit) to
 * the generic `TriggerOrder` shape. For market variants the `limitPrice`
 * field is omitted; for limit variants `order.price` is the limit and
 * `order.trigger_price` is the activation level.
 * @public
 */
export const mapTriggerOrder = (
  order: LtOrder,
  market: MarketDisplay
): TriggerOrder => {
  const type = mapOrderType(order.type)
  const isLimit =
    type === OrderType.TAKE_PROFIT_LIMIT || type === OrderType.STOP_LIMIT
  return {
    // `order_index` is the per-(account, market) numeric id Lighter's L2
    // mutating txs (cancel, modify) require. The matching-engine string
    // label `order_id` is internal to the SDK provider and never crosses
    // this boundary — combined with `market.id` (=market_index), the
    // numeric `order_index` uniquely pins a Lighter order.
    orderId: String(order.order_index),
    market,
    type,
    size: order.initial_base_amount,
    triggerPrice: order.trigger_price,
    ...(isLimit ? { limitPrice: order.price } : {}),
    createdAt: new Date(order.created_at * 1000).toISOString(),
  }
}

/**
 * Map a raw Lighter order to the generic OpenOrder type.
 * @param market - Backend-resolved market identity for `order.market_index`.
 * @public
 */
export const mapOrder = (order: LtOrder, market: MarketDisplay): OpenOrder => ({
  orderId: String(order.order_index),
  market,
  side: order.is_ask ? OrderSide.SELL : OrderSide.BUY,
  type: mapOrderType(order.type),
  size: order.initial_base_amount,
  price: order.price,
  filledSize: order.filled_base_amount,
  reduceOnly: order.reduce_only,
  createdAt: new Date(order.created_at * 1000).toISOString(),
})

/**
 * Walk a flat list of raw Lighter orders and bucket each into the
 * `OpenOrder` / `TriggerOrder` arrays the cross-provider `OrdersResponse`
 * declares, plus a `terminated` list of orderIds whose status has reached
 * a terminal state (filled / cancelled / rejected / expired) — consumers
 * applying WS deltas evict those from the cached buckets. REST callers
 * see `terminated: []` because `accountActiveOrders` returns active only.
 * @public
 */
export const classifyAndMapOrders = (
  orders: LtOrder[],
  resolveMarket: (marketIndex: number) => MarketDisplay
): {
  openOrders: OpenOrder[]
  triggerOrders: TriggerOrder[]
  terminated: string[]
} => {
  const openOrders: OpenOrder[] = []
  const triggerOrders: TriggerOrder[] = []
  const terminated: string[] = []
  for (const raw of orders) {
    const orderId = String(raw.order_index)
    if (!isActiveOrderStatus(mapOrderStatus(raw.status))) {
      terminated.push(orderId)
      continue
    }
    const market = resolveMarket(raw.market_index)
    if (isTriggerOrder(raw)) {
      triggerOrders.push(mapTriggerOrder(raw, market))
    } else {
      openOrders.push(mapOrder(raw, market))
    }
  }
  return { openOrders, triggerOrders, terminated }
}

/**
 * Map a raw Lighter order to the rich Order type — adds status, time-in-force
 * and remaining/filled sizes on top of the OpenOrder fields.
 * @public
 */
export const mapOrderDetail = (
  order: LtOrder,
  market: MarketDisplay
): Order => ({
  orderId: String(order.order_index),
  market,
  side: order.is_ask ? OrderSide.SELL : OrderSide.BUY,
  type: mapOrderType(order.type),
  price: order.price,
  originalSize: order.initial_base_amount,
  remainingSize: order.remaining_base_amount,
  filledSize: order.filled_base_amount,
  timeInForce: mapTimeInForce(order.time_in_force),
  reduceOnly: order.reduce_only,
  status: mapOrderStatus(order.status),
  statusReason: mapStatusReason(order.status),
  createdAt: new Date(order.created_at * 1000).toISOString(),
  updatedAt: new Date(order.updated_at * 1000).toISOString(),
})
