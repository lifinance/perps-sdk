import {
  type DecimalString,
  type Fill,
  FillClassification,
  OrderSide,
} from '@lifi/perps-types'
import Big from 'big.js'
import {
  absDecimalString,
  addDecimalString,
  addDecimalStrings,
  divideDecimalString,
  multiplyDecimalString,
  subtractDecimalString,
} from '../decimal/arithmetic.js'
import { isDecimalStringGreaterThan } from '../decimal/compare.js'
import { isDecimalString } from '../decimal/parse.js'
import {
  calculateInitialMarginRoe,
  isPositiveDecimalString,
} from './position.js'

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

const CLOSING_CLASSIFICATIONS: ReadonlySet<FillClassification> = new Set([
  FillClassification.REDUCED_LONG,
  FillClassification.REDUCED_SHORT,
  FillClassification.CLOSED_LONG,
  FillClassification.CLOSED_SHORT,
  FillClassification.SWITCHED_LONG,
  FillClassification.SWITCHED_SHORT,
])

// Without `startPosition` a flip hides how much of the fill closed.
const FULL_SIZE_CLOSING_CLASSIFICATIONS: ReadonlySet<FillClassification> =
  new Set([
    FillClassification.REDUCED_LONG,
    FillClassification.REDUCED_SHORT,
    FillClassification.CLOSED_LONG,
    FillClassification.CLOSED_SHORT,
  ])

/**
 * Part of a fill that reduced the position held before it:
 * `min(|startPosition|, size)`. Without `startPosition`, the full `size` of a
 * reducing or closing fill.
 *
 * @returns `undefined` for a fill that opens, increases or trades spot, for a
 *   flip without `startPosition`, or when `size` is not a positive decimal
 *   string or `startPosition` is not a decimal string. Never throws.
 * @public
 */
export function calculateFillClosedSize(
  fill: Pick<Fill, 'size' | 'startPosition' | 'classification'>
): DecimalString | undefined {
  const { size, startPosition, classification } = fill
  if (!isPositiveDecimalString(size)) {
    return undefined
  }
  if (startPosition === undefined) {
    return FULL_SIZE_CLOSING_CLASSIFICATIONS.has(classification)
      ? size
      : undefined
  }
  if (
    !CLOSING_CLASSIFICATIONS.has(classification) ||
    !isDecimalString(startPosition)
  ) {
    return undefined
  }
  const heldSize = absDecimalString(startPosition)
  return isDecimalStringGreaterThan(size, heldSize) ? heldSize : size
}

// A sell closes a long: pnl = (price − entry) × closedSize. A buy closes a short.
const calculateEntryPriceFromPnl = (
  fill: Fill,
  pnl: DecimalString | undefined,
  closedSize: DecimalString
): DecimalString | undefined => {
  if (!isDecimalString(pnl) || !isPositiveDecimalString(fill.price)) {
    return undefined
  }
  const pnlPerUnit = divideDecimalString(pnl, closedSize)
  const entryPrice =
    fill.side === OrderSide.SELL
      ? subtractDecimalString(fill.price, pnlPerUnit)
      : addDecimalString(fill.price, pnlPerUnit)
  return isDecimalStringGreaterThan(entryPrice, '0') ? entryPrice : undefined
}

/**
 * Complete a fill with `closedSize`, `entryPrice` and `returnOnEquity`. A
 * positive `entryPrice` on the input stays; otherwise it comes from
 * `realizedPnl`, `closedSize` and `price`. ROE comes from
 * `calculateInitialMarginRoe`, and a `null` `realizedPnl` counts as zero.
 * A fill without a closed part gives none of the three fields.
 *
 * @param leverage - Leverage for the ROE: `Fill.leverage` when the venue sends
 *   it, else the current setting of the market. No ROE when it is not a
 *   positive decimal string.
 * @returns A new fill. Never throws or warns.
 * @public
 */
export function buildFill(
  fill: Fill,
  leverage: DecimalString | undefined
): Fill {
  const {
    closedSize: _closedSize,
    entryPrice: inputEntryPrice,
    returnOnEquity: _returnOnEquity,
    ...fields
  } = fill
  const closedSize = calculateFillClosedSize(fill)
  if (closedSize === undefined) {
    return fields
  }
  const built: Fill = { ...fields, closedSize }
  const pnl = fill.realizedPnl === null ? '0' : fill.realizedPnl
  const entryPrice = isPositiveDecimalString(inputEntryPrice)
    ? inputEntryPrice
    : calculateEntryPriceFromPnl(fill, pnl, closedSize)
  if (entryPrice === undefined) {
    return built
  }
  built.entryPrice = entryPrice
  if (isDecimalString(pnl) && isPositiveDecimalString(leverage)) {
    built.returnOnEquity = calculateInitialMarginRoe(
      pnl,
      closedSize,
      entryPrice,
      leverage
    )
  }
  return built
}
