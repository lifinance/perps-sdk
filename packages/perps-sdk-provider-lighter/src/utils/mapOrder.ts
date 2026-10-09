import {
  isActiveOrderStatus,
  PerpsError,
  safeDivideDecimalString,
  safeIsDecimalStringGreaterThan,
  safeTimestampToIsoString,
  triggerConditionFor,
  warnSkippedVenueRow,
  wsLog,
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

// Lighter sends client index 0 as the string "0" for an order placed without one.
const NO_CLIENT_ORDER_ID = '0'

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

const hasFill = (order: LtOrder): boolean =>
  safeIsDecimalStringGreaterThan(order.filled_base_amount, '0') === true

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

const skipOrder = (
  marketId: string,
  field: string,
  value: unknown
): undefined => {
  warnSkippedVenueRow(LIGHTER_PROVIDER_KEY, 'order', field, value, { marketId })
  return undefined
}

/**
 * Map a Lighter order with its venue identity, lifecycle, and execution fields.
 * Venue sizes and prices pass verbatim. A row with an invalid time gives
 * `undefined`. An average price that cannot be derived is omitted.
 */
export const mapOrder = (
  order: LtOrder,
  market: MarketDisplay
): Order | undefined => {
  const type = mapOrderType(order.type)
  const createdAt = rowTimestampToIsoStringOrUndefined(order.created_at * 1000)
  if (createdAt === undefined) {
    return skipOrder(market.id, 'created_at', order.created_at)
  }
  const updatedAt = rowTimestampToIsoStringOrUndefined(order.updated_at * 1000)
  if (updatedAt === undefined) {
    return skipOrder(market.id, 'updated_at', order.updated_at)
  }
  const averagePrice = hasFill(order)
    ? safeDivideDecimalString(
        order.filled_quote_amount,
        order.filled_base_amount
      )
    : undefined
  const expiresAt =
    order.order_expiry > 0
      ? safeTimestampToIsoString(order.order_expiry)
      : undefined
  const status = mapOrderStatus(order)
  const base: OrderBase = {
    orderId: order.order_id,
    ...(order.client_order_id === NO_CLIENT_ORDER_ID
      ? {}
      : { clientOrderId: order.client_order_id }),
    market,
    side: order.is_ask ? OrderSide.SELL : OrderSide.BUY,
    status,
    ...(status === OrderStatus.CANCELLED ? { statusReason: order.status } : {}),
    originalSize: order.initial_base_amount,
    remainingSize: order.remaining_base_amount,
    filledSize: order.filled_base_amount,
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
        ...(type === OrderType.STOP_LIMIT ||
        type === OrderType.TAKE_PROFIT_LIMIT
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

/**
 * Include terminal rows and their ids so consumers can update history and
 * active caches. A row the mapper rejects is dropped and warns once.
 */
export const mapOrderUpdates = (
  rawOrders: LtOrder[],
  resolveMarket: (marketIndex: number) => MarketDisplay | undefined
): { orders: Order[]; terminated: string[] } => {
  const orders: Order[] = []
  const terminated: string[] = []
  for (const raw of rawOrders) {
    const market = resolveMarket(raw.market_index)
    let order: Order | undefined
    let status: OrderStatus
    try {
      order = market === undefined ? undefined : mapOrder(raw, market)
      status = order?.status ?? mapOrderStatus(raw)
    } catch (error) {
      if (!(error instanceof PerpsError)) {
        throw error
      }
      wsLog.droppedRow(
        LIGHTER_PROVIDER_KEY,
        'order',
        `${raw.order_id}: ${error.message}`
      )
      continue
    }
    if (!isActiveOrderStatus(status)) {
      terminated.push(raw.order_id)
    }
    if (order !== undefined) {
      orders.push(order)
    }
  }
  return { orders, terminated }
}
