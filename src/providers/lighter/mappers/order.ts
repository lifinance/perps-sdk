import {
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
} from '../../../enums.js'
import type { OpenOrder, TriggerOrder } from '../../../account.js'
import type { Order } from '../../../action.js'
import type { LtOrder } from '../apiTypes.js'

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
 */
export const isTriggerType = (type: OrderType): boolean =>
  type === OrderType.TAKE_PROFIT_MARKET ||
  type === OrderType.TAKE_PROFIT_LIMIT ||
  type === OrderType.STOP_MARKET ||
  type === OrderType.STOP_LIMIT

/**
 * Map a raw Lighter trigger order (stop/take-profit, market or limit) to
 * the generic `TriggerOrder` shape. For market variants the `limitPrice`
 * field is omitted; for limit variants `order.price` is the limit and
 * `order.trigger_price` is the activation level.
 */
export const mapTriggerOrder = (
  order: LtOrder,
  symbol: string
): TriggerOrder => {
  const type = mapOrderType(order.type)
  const isLimit =
    type === OrderType.TAKE_PROFIT_LIMIT || type === OrderType.STOP_LIMIT
  return {
    id: order.order_id,
    asset: {
      assetId: symbol,
      market: 'lighter',
      displaySymbol: symbol,
      displayQuote: 'USDC',
    },
    type,
    size: order.initial_base_amount,
    triggerPrice: order.trigger_price,
    ...(isLimit ? { limitPrice: order.price } : {}),
    createdAt: new Date(order.created_at * 1000).toISOString(),
  }
}

/**
 * Map a raw Lighter order to the generic OpenOrder type.
 * @param symbol - Resolved symbol (market_index → symbol lookup)
 */
export const mapOrder = (order: LtOrder, symbol: string): OpenOrder => ({
  id: order.order_id,
  asset: {
    assetId: symbol,
    market: 'lighter',
    displaySymbol: symbol,
    displayQuote: 'USDC',
  },
  side: order.is_ask ? OrderSide.SELL : OrderSide.BUY,
  type: mapOrderType(order.type),
  size: order.initial_base_amount,
  price: order.price,
  filledSize: order.filled_base_amount,
  reduceOnly: order.reduce_only,
  createdAt: new Date(order.created_at * 1000).toISOString(),
})

/**
 * Map a raw Lighter order to the rich Order type — adds status, time-in-force
 * and remaining/filled sizes on top of the OpenOrder fields.
 */
export const mapOrderDetail = (order: LtOrder, symbol: string): Order => ({
  orderId: order.order_id,
  asset: {
    assetId: symbol,
    market: 'lighter',
    displaySymbol: symbol,
    displayQuote: 'USDC',
  },
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
