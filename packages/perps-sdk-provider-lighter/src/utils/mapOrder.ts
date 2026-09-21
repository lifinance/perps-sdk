import {
  isActiveOrderStatus,
  PerpsError,
  triggerConditionFor,
} from '@lifi/perps-sdk'
import type { MarketDisplay, Order, OrderBase } from '@lifi/perps-types'
import {
  OrderSide,
  OrderStatus,
  OrderType,
  PerpsErrorCode,
  TimeInForce,
} from '@lifi/perps-types'
import Big from 'big.js'
import type { LtOrder } from '../types/index.js'

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

const mapOrderStatus = (
  order: LtOrder,
  filledSize = new Big(order.filled_base_amount)
): OrderStatus => {
  switch (order.status) {
    case 'pending':
    case 'in-progress':
      return OrderStatus.ACCEPTED
    case 'open':
      if (order.trigger_status === 'parent-order') {
        return OrderStatus.PENDING
      }
      return filledSize.gt(0) ? OrderStatus.PARTIALLY_FILLED : OrderStatus.OPEN
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

/** Map a Lighter order with its venue identity, lifecycle, and execution fields. */
export const mapOrder = (order: LtOrder, market: MarketDisplay): Order => {
  const type = mapOrderType(order.type)
  const filledSize = new Big(order.filled_base_amount)
  const status = mapOrderStatus(order, filledSize)
  const base: OrderBase = {
    orderId: String(order.order_index),
    ...(order.client_order_index === 0
      ? {}
      : { clientOrderId: String(order.client_order_index) }),
    market,
    side: order.is_ask ? OrderSide.SELL : OrderSide.BUY,
    status,
    ...(status === OrderStatus.CANCELLED ? { statusReason: order.status } : {}),
    originalSize: order.initial_base_amount,
    remainingSize: order.remaining_base_amount,
    filledSize: order.filled_base_amount,
    ...(filledSize.gt(0)
      ? {
          averagePrice: new Big(order.filled_quote_amount)
            .div(filledSize)
            .toString(),
        }
      : {}),
    reduceOnly: order.reduce_only,
    ...(order.parent_order_id ? { parentOrderId: order.parent_order_id } : {}),
    createdAt: new Date(order.created_at * 1000).toISOString(),
    updatedAt: new Date(order.updated_at * 1000).toISOString(),
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
    case OrderType.TAKE_PROFIT_LIMIT:
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
    case OrderType.MARKET:
    case OrderType.LIMIT:
      return {
        ...base,
        type,
        price: order.price,
        timeInForce: mapTimeInForce(order.time_in_force),
        ...(order.order_expiry > 0
          ? { expiresAt: new Date(order.order_expiry).toISOString() }
          : {}),
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
