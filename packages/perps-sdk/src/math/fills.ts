import {
  type DecimalString,
  FillClassification,
  OrderSide,
} from '@lifi/perps-types'
import Big from 'big.js'
import { isDecimalStringZero } from '../decimal/compare.js'
import { isDecimalString } from '../decimal/parse.js'

/**
 * Re-exported fill taxonomy used by {@link classifyFillFromPosition}.
 *
 * @public
 */
export { FillClassification }

/**
 * Classify a perpetual fill into the Open/Close/Increase/Reduce/Switch
 * taxonomy from `FillClassification`.
 *
 * @param startPosition Signed position held BEFORE this fill (`> 0` long,
 *   `< 0` short, `0` flat).
 * @param sz Unsigned fill size.
 * @returns `BUY` or `SELL` when `startPosition` or `sz` is not a decimal
 *   string, so one malformed venue fill still maps.
 * @public
 */
export function classifyFillFromPosition(
  startPosition: DecimalString,
  side: OrderSide,
  sz: DecimalString
): FillClassification {
  if (!isDecimalString(startPosition) || !isDecimalString(sz)) {
    return side === OrderSide.BUY
      ? FillClassification.BUY
      : FillClassification.SELL
  }
  const start = new Big(startPosition)
  const size = new Big(sz)
  const end = side === OrderSide.BUY ? start.plus(size) : start.minus(size)

  if (start.eq(0)) {
    return end.gt(0)
      ? FillClassification.OPENED_LONG
      : FillClassification.OPENED_SHORT
  }

  if (start.gt(0)) {
    if (end.eq(0)) {
      return FillClassification.CLOSED_LONG
    }
    if (end.lt(0)) {
      return FillClassification.SWITCHED_SHORT
    }
    if (end.gt(start)) {
      return FillClassification.INCREASED_LONG
    }
    return FillClassification.REDUCED_LONG
  }

  if (end.eq(0)) {
    return FillClassification.CLOSED_SHORT
  }
  if (end.gt(0)) {
    return FillClassification.SWITCHED_LONG
  }
  if (end.lt(start)) {
    return FillClassification.INCREASED_SHORT
  }
  return FillClassification.REDUCED_SHORT
}

/**
 * Classify a fill as open or close based on realizedPnl.
 * @deprecated Use `Fill.classification` instead — it uses startPosition
 * for accurate open/increase/reduce/close/reverse classification.
 * @returns `BUY` or `SELL` when `realizedPnl` is a string that is not a
 *   decimal string.
 * @public
 */
export function classifyFill(
  side: OrderSide,
  realizedPnl: DecimalString | null | undefined
): FillClassification {
  if (realizedPnl != null && !isDecimalString(realizedPnl)) {
    return side === OrderSide.BUY
      ? FillClassification.BUY
      : FillClassification.SELL
  }
  const isClose = realizedPnl != null && !isDecimalStringZero(realizedPnl)
  if (side === OrderSide.BUY) {
    return isClose
      ? FillClassification.CLOSED_SHORT
      : FillClassification.OPENED_LONG
  }
  return isClose
    ? FillClassification.CLOSED_LONG
    : FillClassification.OPENED_SHORT
}
