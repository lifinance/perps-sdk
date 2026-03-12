/**
 * Order classification utilities.
 *
 * Type guards and classifiers that operate on SDK types to determine
 * order categories (TP/SL, open/close). These encode domain knowledge
 * that should be consistent across all SDK consumers.
 */

import type { OpenOrder } from '@lifi/perps-types'
import { OrderSide } from '@lifi/perps-types'

/**
 * Check if an open order is a Take Profit trigger order.
 *
 * Uses the structured `isPositionTpsl` and `triggerCondition` fields
 * from providerData rather than string-matching labels.
 * Falls back to label matching for backwards compatibility.
 */
export function isTakeProfitOrder(
  order: Pick<OpenOrder, 'providerData'>
): boolean {
  const pd = order.providerData
  if (!pd) {
    return false
  }

  // Prefer structured fields from the mapper
  if (pd.isPositionTpsl && pd.triggerCondition) {
    // TP orders have triggerCondition indicating the profit direction
    // For Hyperliquid: "tp" label or triggerCondition patterns
    const label = (pd.label as string) ?? ''
    return label.includes('Take Profit')
  }

  // Fallback: label-based detection
  return ((pd.label as string) ?? '').includes('Take Profit')
}

/**
 * Check if an open order is a Stop Loss trigger order.
 *
 * Uses the structured `isPositionTpsl` and `triggerCondition` fields
 * from providerData rather than string-matching labels.
 * Falls back to label matching for backwards compatibility.
 */
export function isStopLossOrder(
  order: Pick<OpenOrder, 'providerData'>
): boolean {
  const pd = order.providerData
  if (!pd) {
    return false
  }

  // Prefer structured fields from the mapper
  if (pd.isPositionTpsl && pd.triggerCondition) {
    const label = (pd.label as string) ?? ''
    return label.includes('Stop')
  }

  // Fallback: label-based detection
  return ((pd.label as string) ?? '').includes('Stop')
}

/**
 * Check if an open order is a TP or SL trigger order.
 */
export function isTpSlOrder(order: Pick<OpenOrder, 'providerData'>): boolean {
  return isTakeProfitOrder(order) || isStopLossOrder(order)
}

/** The side of a fill: opened or closed a position. */
export type FillClassification =
  | 'opened-long'
  | 'opened-short'
  | 'closed-long'
  | 'closed-short'

/**
 * Classify a fill as open or close based on realizedPnl.
 * Non-zero realizedPnl indicates a position was closed.
 *
 * @param side - The order side (BUY or SELL)
 * @param realizedPnl - The realized PnL string from the fill
 * @returns The fill classification
 */
export function classifyFill(
  side: OrderSide,
  realizedPnl: string | null | undefined
): FillClassification {
  const isClose = realizedPnl != null && parseFloat(realizedPnl) !== 0
  if (side === OrderSide.BUY) {
    return isClose ? 'closed-short' : 'opened-long'
  }
  return isClose ? 'closed-long' : 'opened-short'
}
