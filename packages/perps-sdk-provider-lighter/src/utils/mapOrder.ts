import {
  isActiveOrderStatus,
  isDecimalStringGreaterThan,
  PerpsError,
  safeDivideDecimalString,
  safeTimestampToIsoString,
  triggerConditionFor,
  unknownToDecimalString,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type { MarketDisplay, Order, OrderBase } from '@lifi/perps-types'
import {
  OrderSide,
  OrderStatus,
  OrderType,
  PerpsErrorCode,
  TimeInForce,
} from '@lifi/perps-types'
import { LIGHTER_PROVIDER_KEY } from '../constants.js'
import type { LtOrder } from '../types/index.js'
import { rowTimestampToIsoStringOrUndefined } from './rowTimestamp.js'

const mapOrderType = (type: string): Order['type'] => {
  switch (type.replace(/-/g, '_')) {
    case 'market':
    case 'liquidation':
      return OrderType.MARKET
    case 'limit':
    case 'twap_sub':
      return OrderType.LIMIT
    case 'stop_loss':
      return OrderType.STOP_MARKET
    case 'stop_loss_limit':
      return OrderType.STOP_LIMIT
    case 'take_profit':
      return OrderType.TAKE_PROFIT_MARKET
    case 'take_profit_limit':
      return OrderType.TAKE_PROFIT_LIMIT
    case 'twap':
      return OrderType.TWAP
    default:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Unknown Lighter order type: ${type}`
      )
  }
}

const mapTimeInForce = (tif: string): TimeInForce => {
  switch (tif.replace(/-/g, '_')) {
    case 'good_till_time':
      return TimeInForce.GTT
    case 'immediate_or_cancel':
      return TimeInForce.IOC
    case 'post_only':
      return TimeInForce.POST_ONLY
    default:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Unknown Lighter time in force: ${tif}`
      )
  }
}

const venueDecimal = (value: unknown, field: string): string | undefined => {
  try {
    return unknownToDecimalString(value, field, LIGHTER_PROVIDER_KEY)
  } catch {
    return undefined
  }
}

const hasFill = (order: LtOrder): boolean => {
  const filled = venueDecimal(order.filled_base_amount, 'filled_base_amount')
  return filled !== undefined && isDecimalStringGreaterThan(filled, '0')
}

const mapOrderStatus = (order: LtOrder): OrderStatus => {
  switch (order.status) {
    case 'in-progress':
      return OrderStatus.ACCEPTED
    case 'pending':
      return OrderStatus.OPEN
    case 'open':
      if (order.trigger_status === 'parent-order') {
        return OrderStatus.PENDING
      }
      return hasFill(order) ? OrderStatus.PARTIALLY_FILLED : OrderStatus.OPEN
    case 'triggered':
      return OrderStatus.TRIGGERED
    case 'filled':
      return OrderStatus.FILLED
    case 'canceled-expired':
      return OrderStatus.EXPIRED
    case 'canceled':
    case 'canceled-post-only':
    case 'canceled-reduce-only':
    case 'canceled-position-not-allowed':
    case 'canceled-margin-not-allowed':
    case 'canceled-too-much-slippage':
    case 'canceled-not-enough-liquidity':
    case 'canceled-self-trade':
    case 'canceled-oco':
    case 'canceled-child':
    case 'canceled-liquidation':
    case 'canceled-invalid-balance':
      return OrderStatus.CANCELLED
    default:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Unknown Lighter order status: ${order.status}`
      )
  }
}

const skipOrder = (field: string, value: unknown): undefined => {
  warnSkippedVenueRow(LIGHTER_PROVIDER_KEY, 'order', field, value)
  return undefined
}

const orderSizeOrSkip = (
  field: 'initial_base_amount' | 'remaining_base_amount' | 'filled_base_amount',
  value: string
): string | undefined =>
  venueDecimal(value, field) === undefined ? skipOrder(field, value) : value

/**
 * Map a Lighter order with its venue identity, lifecycle, and execution fields.
 * A row with an invalid size or time gives `undefined`. An invalid limit price or
 * filled quote amount omits that field.
 */
export const mapOrder = (
  order: LtOrder,
  market: MarketDisplay
): Order | undefined => {
  const type = mapOrderType(order.type)
  const originalSize = orderSizeOrSkip(
    'initial_base_amount',
    order.initial_base_amount
  )
  if (originalSize === undefined) {
    return undefined
  }
  const remainingSize = orderSizeOrSkip(
    'remaining_base_amount',
    order.remaining_base_amount
  )
  if (remainingSize === undefined) {
    return undefined
  }
  const filledSize = orderSizeOrSkip(
    'filled_base_amount',
    order.filled_base_amount
  )
  if (filledSize === undefined) {
    return undefined
  }
  const createdAt = rowTimestampToIsoStringOrUndefined(order.created_at * 1000)
  if (createdAt === undefined) {
    return skipOrder('created_at', order.created_at)
  }
  const updatedAt = rowTimestampToIsoStringOrUndefined(order.updated_at * 1000)
  if (updatedAt === undefined) {
    return skipOrder('updated_at', order.updated_at)
  }
  const filledQuote = venueDecimal(
    order.filled_quote_amount,
    'filled_quote_amount'
  )
  const filledAmount = venueDecimal(filledSize, 'filled_base_amount')
  const averagePrice =
    filledQuote !== undefined &&
    filledAmount !== undefined &&
    isDecimalStringGreaterThan(filledAmount, '0')
      ? safeDivideDecimalString(filledQuote, filledAmount)
      : undefined
  const expiresAt =
    order.order_expiry > 0
      ? safeTimestampToIsoString(order.order_expiry)
      : undefined
  const status = mapOrderStatus(order)
  const base: OrderBase = {
    orderId: String(order.order_index),
    ...(order.client_order_index === 0
      ? {}
      : { clientOrderId: String(order.client_order_index) }),
    market,
    side: order.is_ask ? OrderSide.SELL : OrderSide.BUY,
    status,
    ...(status === OrderStatus.CANCELLED ? { statusReason: order.status } : {}),
    originalSize,
    remainingSize,
    filledSize,
    ...(averagePrice === undefined ? {} : { averagePrice }),
    reduceOnly: order.reduce_only,
    ...(order.parent_order_id ? { parentOrderId: order.parent_order_id } : {}),
    createdAt,
    updatedAt,
  }
  switch (type) {
    case OrderType.TWAP:
      return {
        ...base,
        type,
        durationSeconds: order.order_expiry / 1000 - order.created_at,
        startedAt: base.createdAt,
      }
    case OrderType.STOP_MARKET:
    case OrderType.STOP_LIMIT:
    case OrderType.TAKE_PROFIT_MARKET:
    case OrderType.TAKE_PROFIT_LIMIT: {
      return {
        ...base,
        type,
        triggerPrice: order.trigger_price,
        triggerCondition: triggerConditionFor(type, base.side),
        ...((type === OrderType.STOP_LIMIT ||
          type === OrderType.TAKE_PROFIT_LIMIT) &&
        venueDecimal(order.price, 'price') !== undefined
          ? { limitPrice: order.price }
          : {}),
      }
    }
    case OrderType.MARKET:
    case OrderType.LIMIT:
      return {
        ...base,
        type,
        price: order.price,
        timeInForce: mapTimeInForce(order.time_in_force),
        ...(expiresAt === undefined ? {} : { expiresAt }),
      }
  }
}

/** Include terminal rows and their ids so consumers can update history and active caches. */
export const mapOrderUpdates = (
  rawOrders: LtOrder[],
  resolveMarket: (marketIndex: number) => MarketDisplay | undefined
): { orders: Order[]; terminated: string[] } => {
  const orders: Order[] = []
  const terminated: string[] = []
  for (const raw of rawOrders) {
    const market = resolveMarket(raw.market_index)
    const order = market === undefined ? undefined : mapOrder(raw, market)
    if (!isActiveOrderStatus(order?.status ?? mapOrderStatus(raw))) {
      terminated.push(String(raw.order_index))
    }
    if (order !== undefined) {
      orders.push(order)
    }
  }
  return { orders, terminated }
}
