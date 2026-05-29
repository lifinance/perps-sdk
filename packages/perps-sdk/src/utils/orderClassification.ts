/**
 * Order classification utilities.
 *
 * Type guards and classifiers that operate on SDK types to determine
 * order categories (TP/SL, open/close). These use the OrderType enum
 * for classification — no string matching.
 */

import type { OpenOrder } from '@lifi/perps-types'
import {
  FillClassification,
  OrderSide,
  OrderStatus,
  OrderType,
} from '@lifi/perps-types'
import { stringToFloat } from './parse.js'

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
 */
export function isTakeProfitOrder(order: Pick<OpenOrder, 'type'>): boolean {
  return TP_TYPES.has(order.type)
}

/**
 * Check if an open order is a Stop Loss trigger order.
 */
export function isStopLossOrder(order: Pick<OpenOrder, 'type'>): boolean {
  return SL_TYPES.has(order.type)
}

/**
 * Check if an open order is a TP or SL trigger order.
 */
export function isTpSlOrder(order: Pick<OpenOrder, 'type'>): boolean {
  return TP_TYPES.has(order.type) || SL_TYPES.has(order.type)
}

/**
 * Order statuses representing an order still resting on the book (visible
 * in `openOrders` / `triggerOrders`). Anything not in this set is terminal —
 * filled, cancelled, rejected, expired — and should be evicted from the
 * cached orders list when seen in a WS update.
 */
export const ACTIVE_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.OPEN,
  OrderStatus.PENDING,
  OrderStatus.PARTIALLY_FILLED,
  OrderStatus.TRIGGERED,
])

export function isActiveOrderStatus(status: OrderStatus): boolean {
  return ACTIVE_ORDER_STATUSES.has(status)
}

/**
 * Classify a fill as open or close based on realizedPnl.
 * @deprecated Use `Fill.classification` instead — it uses startPosition
 * for accurate open/increase/reduce/close/reverse classification.
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
