/**
 * Pure-function helpers for predicting how a perp position changes after a
 * fill. Used by the add-to-position and partial-close preview blocks to show
 * users what their post-fill values will look like.
 *
 * Sign convention: long = +1, short = -1. Sizes passed to these helpers are
 * always non-negative magnitudes; direction is carried by `isLong`.
 */

/**
 * Direction sign for a position.
 *
 * @param isLong - True for long positions, false for short.
 * @returns +1 for long, -1 for short.
 */
export function directionSign(isLong: boolean): 1 | -1 {
  return isLong ? 1 : -1
}

/**
 * Predicted average entry price after adding to an existing position.
 *
 * Weighted average of the current entry and the new fill price, weighted by
 * the size of each leg in coin units. Both legs assumed in the same direction
 * (this helper is for adding to, not flipping, a position).
 *
 * @param currentSize - Existing position size in coin units (>= 0).
 * @param currentEntry - Existing position's average entry price.
 * @param addSize - Size being added in coin units (>= 0).
 * @param fillPrice - Price the new size is expected to fill at (mid for
 *   market, limitPrice for limit orders).
 * @returns The new weighted-average entry price, or undefined if the inputs
 *   cannot produce a valid average (zero combined size, non-finite values).
 */
export function predictAverageEntryPrice(params: {
  currentSize: number
  currentEntry: number
  addSize: number
  fillPrice: number
}): number | undefined {
  const { currentSize, currentEntry, addSize, fillPrice } = params
  const totalSize = currentSize + addSize
  if (totalSize <= 0) {
    return undefined
  }
  if (!Number.isFinite(currentEntry) || !Number.isFinite(fillPrice)) {
    return undefined
  }
  return (currentSize * currentEntry + addSize * fillPrice) / totalSize
}

/**
 * Predicted effective leverage after adding margin and notional.
 *
 * leverage = totalNotional / totalMargin. The caller computes notional from
 * size and price (`calculateNotionalValue`) and supplies the additional
 * margin the user is about to put up.
 *
 * @returns The new effective leverage, or undefined if total margin is
 *   non-positive.
 */
export function predictNewLeverage(params: {
  currentNotional: number
  currentMargin: number
  addNotional: number
  addMargin: number
}): number | undefined {
  const { currentNotional, currentMargin, addNotional, addMargin } = params
  const totalMargin = currentMargin + addMargin
  if (totalMargin <= 0) {
    return undefined
  }
  return (currentNotional + addNotional) / totalMargin
}

/**
 * Predicted unrealised PnL at the current mark price.
 *
 * `pnl = (markPrice - entryPrice) * size * directionSign(isLong)`
 *
 * @param size - Position size as a non-negative magnitude.
 */
export function predictUnrealizedPnl(params: {
  entryPrice: number
  markPrice: number
  size: number
  isLong: boolean
}): number {
  const { entryPrice, markPrice, size, isLong } = params
  return (markPrice - entryPrice) * size * directionSign(isLong)
}

/**
 * Realised PnL on the portion of a position being closed.
 *
 * `rPnl = (closePrice - entryPrice) * closeSize * directionSign(isLong)`
 *
 * @param closeSize - Size being closed as a non-negative magnitude.
 */
export function realizedPnlOnClose(params: {
  entryPrice: number
  closePrice: number
  closeSize: number
  isLong: boolean
}): number {
  const { entryPrice, closePrice, closeSize, isLong } = params
  return (closePrice - entryPrice) * closeSize * directionSign(isLong)
}
