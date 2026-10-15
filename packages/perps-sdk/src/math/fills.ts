import {
  type DecimalString,
  type Fill,
  FillClassification,
  OrderSide,
} from '@lifi/perps-types'
import Big from 'big.js'
import {
  addDecimalStrings,
  divideDecimalString,
  multiplyDecimalString,
} from '../decimal/arithmetic.js'
import { isDecimalStringGreaterThan } from '../decimal/compare.js'
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
 * @returns `BUY` or `SELL` when `startPosition` or `sz` does not match the
 *   decimal pattern, so one malformed venue fill still maps.
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
 * Size-weighted average price of `fills`, Σ(size × price) / Σ size, to the
 * 40 decimal places of division with no display rounding. A fill whose `size`
 * or `price` does not match the decimal pattern is skipped.
 *
 * @returns `undefined` when the summed size is not above zero.
 * @public
 */
export function calculateAverageFillPrice(
  fills: readonly Fill[]
): DecimalString | undefined {
  const priced = fills.filter(
    (fill) => isDecimalString(fill.size) && isDecimalString(fill.price)
  )
  const totalSize = addDecimalStrings(priced.map((fill) => fill.size))
  if (!isDecimalStringGreaterThan(totalSize, '0')) {
    return undefined
  }
  const notional = addDecimalStrings(
    priced.map((fill) => multiplyDecimalString(fill.size, fill.price))
  )
  return divideDecimalString(notional, totalSize)
}
