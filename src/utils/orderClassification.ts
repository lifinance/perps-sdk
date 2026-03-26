/**
 * Order classification utilities.
 *
 * Type guards and classifiers that operate on SDK types to determine
 * order categories (TP/SL, open/close). These use the OrderType enum
 * for classification — no string matching.
 */

import type { OpenOrder } from '@lifi/perps-types'
import { FillClassification, OrderSide, OrderType } from '@lifi/perps-types'
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
 * Classify a fill as open or close based on realizedPnl.
 * @deprecated Use `HistoryItem.classification` instead — it uses startPosition
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
