import {
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
} from '../../../enums.js'
import type { OpenOrder } from '../../../account.js'
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
  createdAt: new Date(order.created_at * 1000).toISOString(),
  updatedAt: new Date(order.updated_at * 1000).toISOString(),
})
