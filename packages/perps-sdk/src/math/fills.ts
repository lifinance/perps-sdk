import {
  type DecimalString,
  FillClassification,
  OrderSide,
} from '@lifi/perps-types'
import { requireDecimal } from '../decimal/requireDecimal.js'

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
 * @param side Hyperliquid-style: `'B'` for buy, anything else for sell.
 * @param sz Unsigned fill size.
 * @throws {PerpsError} `ValidationError` when `startPosition` or `sz` is not a
 *   decimal string.
 * @public
 */
export function classifyFillFromPosition(
  startPosition: DecimalString,
  side: string,
  sz: DecimalString
): FillClassification {
  const start = requireDecimal(
    startPosition,
    'classifyFillFromPosition(startPosition)'
  )
  const size = requireDecimal(sz, 'classifyFillFromPosition(sz)')
  const end = side === 'B' ? start.plus(size) : start.minus(size)

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
 * @throws {PerpsError} `ValidationError` when `realizedPnl` is a string that
 *   is not a decimal string.
 * @public
 */
export function classifyFill(
  side: OrderSide,
  realizedPnl: DecimalString | null | undefined
): FillClassification {
  const isClose =
    realizedPnl != null &&
    !requireDecimal(realizedPnl, 'classifyFill(realizedPnl)').eq(0)
  if (side === OrderSide.BUY) {
    return isClose
      ? FillClassification.CLOSED_SHORT
      : FillClassification.OPENED_LONG
  }
  return isClose
    ? FillClassification.CLOSED_LONG
    : FillClassification.OPENED_SHORT
}
