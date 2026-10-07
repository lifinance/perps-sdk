import {
  ACTIVE_ORDER_STATUSES,
  isDecimalStringGreaterThan,
  PerpsError,
  safeDivideDecimalString,
  subtractDecimalString,
  triggerConditionFor,
  unknownToDecimalString,
  warnSkippedVenueRow,
  wsLog,
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
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoOrder, OndoTwapOrder } from '../types/wire.js'
import { rowTimestampToIsoStringOrWarn } from './venueValues.js'

const skipOrder = (
  marketId: string,
  field: string,
  value: unknown
): undefined => {
  warnSkippedVenueRow(ONDO_PROVIDER_KEY, 'order', field, value, { marketId })
  return undefined
}

const orderSizeOrSkip = (
  marketId: string,
  field: string,
  value: unknown
): string | undefined => {
  try {
    return unknownToDecimalString(value, field, ONDO_PROVIDER_KEY)
  } catch {
    return skipOrder(marketId, field, value)
  }
}

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

/**
 * Map Ondo regular, trigger and TWAP rows to the shared order union. A row with
 * an invalid size or time gives `undefined`. Prices are the raw venue strings;
 * an invalid `filledCost` omits `averagePrice`.
 */
export const mapOrder = (
  order: OndoOrder | OndoTwapOrder,
  market: MarketDisplay,
  parentOrderId?: string
): Order | undefined => {
  const twap = 'twapId' in order
  const filledSize = orderSizeOrSkip(market.id, 'filledSize', order.filledSize)
  if (filledSize === undefined) {
    return undefined
  }
  const sizeValue = twap
    ? orderSizeOrSkip(market.id, 'totalSize', order.totalSize)
    : orderSizeOrSkip(market.id, 'size', order.size)
  if (sizeValue === undefined) {
    return undefined
  }
  const isPartlyFilled = isDecimalStringGreaterThan(filledSize, '0')
  const status = twap
    ? twapStatus(order.orderStatus)
    : mapOrderStatus(order.status)
  const [createdField, createdValue] = twap
    ? (['startTime', order.startTime] as const)
    : (['createdAt', order.createdAt] as const)
  const createdAt = rowTimestampToIsoStringOrWarn(
    'order',
    createdField,
    createdValue,
    market.id
  )
  if (createdAt === undefined) {
    return undefined
  }
  const updatedValue = twap
    ? (order.finishTime ?? order.startTime)
    : (order.canceledAt ?? order.filledAt ?? order.createdAt)
  const updatedAt = rowTimestampToIsoStringOrWarn(
    'order',
    'updatedAt',
    updatedValue,
    market.id
  )
  if (updatedAt === undefined) {
    return undefined
  }
  const averagePrice = twap
    ? order.avgFilledPrice
    : isPartlyFilled
      ? safeDivideDecimalString(order.filledCost, filledSize)
      : undefined
  const base: OrderBase = {
    orderId: twap ? order.twapId : order.orderId,
    market,
    side: order.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
    status:
      status === OrderStatus.OPEN && isPartlyFilled
        ? OrderStatus.PARTIALLY_FILLED
        : status,
    originalSize: sizeValue,
    remainingSize: subtractDecimalString(sizeValue, filledSize),
    filledSize,
    reduceOnly: order.reduceOnly ?? false,
    createdAt,
    updatedAt,
    ...(isPartlyFilled && averagePrice !== undefined ? { averagePrice } : {}),
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
  const marketOrder = order.type === 'market'
  return {
    ...base,
    type: marketOrder ? OrderType.MARKET : OrderType.LIMIT,
    price: order.price,
    // Ondo market orders execute immediately and omit timeInForce on reads.
    timeInForce:
      order.timeInForce === undefined
        ? marketOrder
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
      wsLog.droppedRow(
        ONDO_PROVIDER_KEY,
        'order',
        `${row.orderId}: ${error.message}`
      )
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
