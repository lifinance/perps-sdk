import type {
  Order,
  RegularOrder,
  TriggerOrder,
  TwapOrder,
} from '@lifi/perps-types'
import {
  FillClassification,
  OrderSide,
  OrderStatus,
  OrderType,
  TriggerCondition,
} from '@lifi/perps-types'
import { stringToFloat } from './parse.js'

/**
 * Re-exported fill taxonomy used by {@link classifyFillFromPosition}.
 *
 * @public
 */
export { FillClassification }

const TP_TYPES = new Set<OrderType>([
  OrderType.TAKE_PROFIT_MARKET,
  OrderType.TAKE_PROFIT_LIMIT,
])

const SL_TYPES = new Set<OrderType>([
  OrderType.STOP_MARKET,
  OrderType.STOP_LIMIT,
])

/**
 * Check if an open order is a Take Profit trigger order.
 * @public
 */
export function isTakeProfitOrder(order: Pick<Order, 'type'>): boolean {
  return TP_TYPES.has(order.type)
}

/**
 * Check if an open order is a Stop Loss trigger order.
 * @public
 */
export function isStopLossOrder(order: Pick<Order, 'type'>): boolean {
  return SL_TYPES.has(order.type)
}

/**
 * Check if an open order is a TP or SL trigger order.
 * @public
 */
export function isTpSlOrder(order: Pick<Order, 'type'>): boolean {
  return TP_TYPES.has(order.type) || SL_TYPES.has(order.type)
}

/** Narrow an order to a price-activated order. */
export function isTriggerOrder(order: Order): order is TriggerOrder {
  return isTpSlOrder(order)
}

/** Narrow an order to a market or limit order. */
export function isRegularOrder(order: Order): order is RegularOrder {
  return order.type === OrderType.MARKET || order.type === OrderType.LIMIT
}

/** Narrow an order to a time-weighted execution parent. */
export function isTwapOrder(order: Order): order is TwapOrder {
  return order.type === OrderType.TWAP
}

/** Derive the trigger price relation from the trigger type and execution side. */
export function triggerConditionFor(
  type: TriggerOrder['type'],
  side: OrderSide
): TriggerCondition {
  const takeProfit = TP_TYPES.has(type)
  return takeProfit === (side === OrderSide.SELL)
    ? TriggerCondition.ABOVE
    : TriggerCondition.BELOW
}

/** Lifecycle statuses included in order reads by default. */
export const ACTIVE_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.OPEN,
  OrderStatus.PENDING,
  OrderStatus.PARTIALLY_FILLED,
  OrderStatus.TRIGGERED,
])

/**
 * Whether `status` is one of {@link ACTIVE_ORDER_STATUSES}.
 *
 * @public
 */
export function isActiveOrderStatus(status: OrderStatus): boolean {
  return ACTIVE_ORDER_STATUSES.has(status)
}

/**
 * Classify a fill as open or close based on realizedPnl.
 * @deprecated Use `Fill.classification` instead — it uses startPosition
 * for accurate open/increase/reduce/close/reverse classification.
 * @public
 */
export function classifyFill(
  side: OrderSide,
  realizedPnl: string | null | undefined
): FillClassification {
  const isClose = realizedPnl != null && stringToFloat(realizedPnl) !== 0
  if (side === OrderSide.BUY) {
    return isClose
      ? FillClassification.CLOSED_SHORT
      : FillClassification.OPENED_LONG
  }
  return isClose
    ? FillClassification.CLOSED_LONG
    : FillClassification.OPENED_SHORT
}
