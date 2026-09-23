import {
  ACTIVE_ORDER_STATUSES,
  PerpsError,
  triggerConditionFor,
} from '@lifi/perps-sdk'
import {
  type MarketDisplay,
  type Order,
  type OrderBase,
  OrderSide,
  OrderStatus,
  OrderType,
  PerpsErrorCode,
  TimeInForce,
} from '@lifi/perps-types'
import Big from 'big.js'
import type { OndoOrder, OndoTwapOrder } from '../types/wire.js'

/** Map supported Ondo lifecycle states; unsupported states fail explicitly. */
export const mapOrderStatus = (status: string): OrderStatus => {
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
    default:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Unsupported Ondo order status: ${status}`
      )
  }
}

const twapStatus = (status: string): OrderStatus => {
  switch (status) {
    case 'running':
      return OrderStatus.OPEN
    case 'completed':
      return OrderStatus.FILLED
    case 'cancelled':
      return OrderStatus.CANCELLED
    default:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Unsupported Ondo TWAP status: ${status}`
      )
  }
}

const mapTimeInForce = (tif: string): TimeInForce => {
  switch (tif) {
    case 'GTC':
      return TimeInForce.GTC
    case 'IOC':
      return TimeInForce.IOC
    default:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Unsupported Ondo time in force: ${tif}`
      )
  }
}

/** Map Ondo regular, trigger and TWAP rows to the shared order union. */
export const mapOrder = (
  order: OndoOrder | OndoTwapOrder,
  market: MarketDisplay,
  parentOrderId?: string
): Order => {
  const twap = 'twapId' in order
  const filled = new Big(order.filledSize)
  const status = twap
    ? twapStatus(order.orderStatus)
    : mapOrderStatus(order.status)
  const createdAt = new Date(
    twap ? order.startTime : order.createdAt
  ).toISOString()
  const base: OrderBase = {
    orderId: twap ? order.twapId : order.orderId,
    market,
    side: order.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
    status:
      status === OrderStatus.OPEN && filled.gt(0)
        ? OrderStatus.PARTIALLY_FILLED
        : status,
    originalSize: new Big(twap ? order.totalSize : order.size).toFixed(),
    remainingSize: new Big(twap ? order.totalSize : order.size)
      .minus(filled)
      .toFixed(),
    filledSize: order.filledSize,
    reduceOnly: order.reduceOnly ?? false,
    createdAt,
    updatedAt: new Date(
      twap
        ? (order.finishTime ?? order.startTime)
        : (order.canceledAt ?? order.filledAt ?? order.createdAt)
    ).toISOString(),
    ...(filled.gt(0)
      ? {
          averagePrice: twap
            ? order.avgFilledPrice
            : new Big(order.filledCost).div(filled).toFixed(),
        }
      : {}),
  }
  if (parentOrderId !== undefined) {
    base.parentOrderId = parentOrderId
  }
  if (twap) {
    if (
      status === OrderStatus.CANCELLED &&
      order.twapCancelReason !== undefined
    ) {
      base.statusReason = String(order.twapCancelReason)
    }
    return {
      ...base,
      type: OrderType.TWAP,
      durationSeconds: order.runningTime,
      startedAt: createdAt,
    }
  }
  if (order.clientOrderId !== undefined) {
    base.clientOrderId = order.clientOrderId
  }
  if (order.parentOrderId !== undefined) {
    base.parentOrderId = order.parentOrderId
  }
  if (status === OrderStatus.CANCELLED && order.cancelReason !== undefined) {
    base.statusReason = order.cancelReason
  }
  const stopOrderType =
    order.stopOrderType ??
    (order.type === 'stopMarket'
      ? 'stopLoss'
      : order.type === 'takeProfitMarket'
        ? 'takeProfit'
        : undefined)
  if (stopOrderType !== undefined || order.triggerPrice !== undefined) {
    if (stopOrderType === undefined || order.triggerPrice === undefined) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Incomplete Ondo trigger order: ${order.orderId}`
      )
    }
    const limit = order.type === 'limit'
    const type =
      stopOrderType === 'takeProfit'
        ? limit
          ? OrderType.TAKE_PROFIT_LIMIT
          : OrderType.TAKE_PROFIT_MARKET
        : limit
          ? OrderType.STOP_LIMIT
          : OrderType.STOP_MARKET
    return {
      ...base,
      type,
      triggerPrice: order.triggerPrice,
      triggerCondition: triggerConditionFor(type, base.side),
      ...(limit ? { limitPrice: order.price } : {}),
    }
  }
  return {
    ...base,
    type: order.type === 'market' ? OrderType.MARKET : OrderType.LIMIT,
    price: order.price,
    // Ondo market orders execute immediately and omit timeInForce on reads.
    timeInForce:
      order.timeInForce === undefined
        ? order.type === 'market'
          ? TimeInForce.IOC
          : TimeInForce.GTC
        : mapTimeInForce(order.timeInForce),
  }
}

/**
 * Map WebSocket rows and retain terminal ids for active-order consumers. A row
 * the mapper rejects is dropped, so one row costs only itself and not the whole
 * frame.
 */
export const mapOrderUpdates = (
  rows: OndoOrder[],
  resolveMarket: (market: string) => MarketDisplay | undefined
): { orders: Order[]; terminated: string[] } => {
  const orders: Order[] = []
  const terminated: string[] = []
  for (const row of rows) {
    const market = resolveMarket(row.market)
    let order: Order | undefined
    let status: OrderStatus
    try {
      order = market === undefined ? undefined : mapOrder(row, market)
      // A row the registry cannot resolve still retires its own active entry:
      // the id alone closes it out, and the status needs no market to read.
      status = order?.status ?? mapOrderStatus(row.status)
    } catch (error) {
      if (!(error instanceof PerpsError)) {
        throw error
      }
      continue
    }
    if (!ACTIVE_ORDER_STATUSES.has(status)) {
      terminated.push(order?.orderId ?? row.orderId)
    }
    if (order !== undefined) {
      orders.push(order)
    }
  }
  return { orders, terminated }
}
