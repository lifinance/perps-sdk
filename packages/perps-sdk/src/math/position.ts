/**
 * Display-tier position formulas. Every function takes and gives `number`;
 * exact decimal arithmetic happens internally with `DivBig`.
 *
 * Sign convention: long = +1, short = -1. Sizes passed to the `estimate*`
 * helpers are always non-negative magnitudes; direction is carried by
 * `isLong`.
 */

import { areFinite, DivBig } from '../decimal/big.js'

/**
 * Direction sign for a position.
 *
 * @deprecated Inline `isLong ? 1 : -1`. Removed in the next major.
 */
export function directionSign(isLong: boolean): 1 | -1 {
  return isLong ? 1 : -1
}

/**
 * Calculate notional value of a position.
 *
 * @param size - Position size in asset units
 * @param price - Current asset price
 * @returns Notional value in USD
 * @public
 */
export function calculateNotionalValue(size: number, price: number): number {
  if (!areFinite(size, price)) {
    return Number.NaN
  }
  return new DivBig(size).abs().times(price).toNumber()
}

/**
 * Calculate unrealized PnL.
 *
 * @param entryPrice - Position entry price
 * @param currentPrice - Current market price
 * @param size - Position size (positive for long, negative for short)
 * @returns Unrealized PnL in USD
 * @public
 */
export function calculateUnrealizedPnl(
  entryPrice: number,
  currentPrice: number,
  size: number
): number {
  if (!areFinite(entryPrice, currentPrice, size)) {
    return Number.NaN
  }
  return new DivBig(currentPrice).minus(entryPrice).times(size).toNumber()
}

/**
 * Calculate return on equity (ROE) percentage.
 *
 * @param pnl - Profit/loss in USD
 * @param margin - Initial margin in USD
 * @returns ROE as percentage (e.g., 10 for 10%)
 * @public
 */
export function calculateRoe(pnl: number, margin: number): number {
  if (margin === 0) {
    return 0
  }
  if (!areFinite(pnl, margin)) {
    return Number.NaN
  }
  return new DivBig(pnl).div(margin).times(100).toNumber()
}

/**
 * Calculate required margin for a position.
 *
 * @param notionalValue - Position notional value in USD
 * @param leverage - Position leverage
 * @returns Required margin in USD
 * @public
 */
export function calculateRequiredMargin(
  notionalValue: number,
  leverage: number
): number {
  if (leverage === 0) {
    return notionalValue / leverage
  }
  if (!areFinite(notionalValue, leverage)) {
    return Number.NaN
  }
  return new DivBig(notionalValue).div(leverage).toNumber()
}

/**
 * Distance from the current price to the liquidation price, as a percentage of
 * the current price.
 *
 * @param liquidationPrice - The position's liquidation price
 * @param currentPrice - Current market price
 * @returns Absolute distance as a percentage, or 0 when current price is zero
 * @public
 */
export function calculateLiquidationDistance(params: {
  liquidationPrice: number
  currentPrice: number
}): number {
  const { liquidationPrice, currentPrice } = params
  if (currentPrice === 0) {
    return 0
  }
  return Math.abs((liquidationPrice - currentPrice) / currentPrice) * 100
}

/**
 * @deprecated Use `calculateLiquidationDistance`. Removed in the next major.
 */
export const liquidationDistancePercent = calculateLiquidationDistance

/**
 * Effective leverage of an open position.
 *
 * leverage = positionValueUsd / marginUsd
 *
 * @param positionValueUsd - Position notional value in USD
 * @param marginUsd - Margin backing the position in USD
 * @returns Effective leverage, or 0 when margin is zero
 * @public
 */
export function calculateEffectiveLeverage(params: {
  positionValueUsd: number
  marginUsd: number
}): number {
  const { positionValueUsd, marginUsd } = params
  if (marginUsd === 0) {
    return 0
  }
  if (!areFinite(positionValueUsd, marginUsd)) {
    return Number.NaN
  }
  return new DivBig(positionValueUsd).div(marginUsd).toNumber()
}

/**
 * @deprecated Use `calculateEffectiveLeverage`. Removed in the next major.
 */
export const effectiveLeverage = calculateEffectiveLeverage

/**
 * Estimated liquidation price for an isolated-margin position, parameterised
 * by the venue's maintenance margin rate.
 *
 * Standard isolated-margin model (new position, no existing exposure):
 *   margin_per_unit      = entryPrice / leverage
 *   maintenance_per_unit = entryPrice * mmr
 *   margin_available     = margin_per_unit - maintenance_per_unit
 *   liq_price            = entryPrice - side * margin_available / (1 - mmr * side)
 *
 * For existing positions, prefer `Position.liquidationPrice` from the venue.
 *
 * @param maintenanceMarginRate - Venue maintenance margin rate as a fraction
 *   (e.g. 0.01 = 1%).
 * @returns Estimated liquidation price, or undefined if the inputs cannot
 *   produce one (zero leverage, degenerate denominator).
 * @public
 */
export function estimateLiquidationPrice(params: {
  entryPrice: number
  leverage: number
  isLong: boolean
  maintenanceMarginRate: number
}): number | undefined {
  const { entryPrice, leverage, isLong, maintenanceMarginRate } = params
  if (leverage === 0) {
    return undefined
  }
  const side = isLong ? 1 : -1
  const denominator = 1 - maintenanceMarginRate * side
  if (denominator === 0) {
    return undefined
  }
  if (!areFinite(entryPrice, leverage, maintenanceMarginRate)) {
    return Number.NaN
  }
  const mmr = new DivBig(maintenanceMarginRate)
  const marginAvailable = new DivBig(1)
    .div(leverage)
    .minus(mmr)
    .times(entryPrice)
  return new DivBig(entryPrice)
    .minus(marginAvailable.times(side).div(mmr.times(-side).plus(1)))
    .toNumber()
}

/**
 * @deprecated Use `estimateLiquidationPrice`. Removed in the next major.
 */
export const estimateIsolatedLiquidationPrice = estimateLiquidationPrice

/**
 * Whether an isolated position with this liquidation price is already past
 * liquidation at `currentPrice`: a long liquidates when the price falls to its
 * liquidation level, a short when it rises to it. A non-positive price on
 * either side counts as unknown, so the result is `false`.
 *
 * @public
 */
export function wouldImmediatelyLiquidate(params: {
  liquidationPrice: number
  currentPrice: number
  isLong: boolean
}): boolean {
  const { liquidationPrice, currentPrice, isLong } = params
  if (currentPrice <= 0 || liquidationPrice <= 0) {
    return false
  }
  return isLong
    ? liquidationPrice >= currentPrice
    : liquidationPrice <= currentPrice
}

/**
 * Estimated average entry price after adding to an existing position.
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
 * @public
 */
export function estimateAverageEntryPrice(params: {
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
  if (!areFinite(currentSize, addSize)) {
    return Number.NaN
  }
  return new DivBig(currentSize)
    .times(currentEntry)
    .plus(new DivBig(addSize).times(fillPrice))
    .div(new DivBig(currentSize).plus(addSize))
    .toNumber()
}

/**
 * @deprecated Use `estimateAverageEntryPrice`. Removed in the next major.
 */
export const predictAverageEntryPrice = estimateAverageEntryPrice

/**
 * Estimated effective leverage after adding margin and notional.
 *
 * leverage = totalNotional / totalMargin. The caller computes notional from
 * size and price (`calculateNotionalValue`) and supplies the additional
 * margin the user is about to put up.
 *
 * @returns The new effective leverage, or undefined if total margin is
 *   non-positive.
 * @public
 */
export function estimateNewLeverage(params: {
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
  if (!areFinite(currentNotional, currentMargin, addNotional, addMargin)) {
    return Number.NaN
  }
  return new DivBig(currentNotional)
    .plus(addNotional)
    .div(new DivBig(currentMargin).plus(addMargin))
    .toNumber()
}

/**
 * @deprecated Use `estimateNewLeverage`. Removed in the next major.
 */
export const predictNewLeverage = estimateNewLeverage

/**
 * Estimated unrealised PnL at the current mark price.
 *
 * `pnl = (markPrice - entryPrice) * size * (isLong ? 1 : -1)`
 *
 * @param size - Position size as a non-negative magnitude.
 * @public
 */
export function estimateUnrealizedPnl(params: {
  entryPrice: number
  markPrice: number
  size: number
  isLong: boolean
}): number {
  const { entryPrice, markPrice, size, isLong } = params
  if (!areFinite(entryPrice, markPrice, size)) {
    return Number.NaN
  }
  return new DivBig(markPrice)
    .minus(entryPrice)
    .times(size)
    .times(isLong ? 1 : -1)
    .toNumber()
}

/**
 * @deprecated Use `estimateUnrealizedPnl`. Removed in the next major.
 */
export const predictUnrealizedPnl = estimateUnrealizedPnl

/**
 * Realised PnL on the portion of a position being closed.
 *
 * `rPnl = (closePrice - entryPrice) * closeSize * (isLong ? 1 : -1)`
 *
 * @param closeSize - Size being closed as a non-negative magnitude.
 * @public
 */
export function calculateRealizedPnl(params: {
  entryPrice: number
  closePrice: number
  closeSize: number
  isLong: boolean
}): number {
  const { entryPrice, closePrice, closeSize, isLong } = params
  if (!areFinite(entryPrice, closePrice, closeSize)) {
    return Number.NaN
  }
  return new DivBig(closePrice)
    .minus(entryPrice)
    .times(closeSize)
    .times(isLong ? 1 : -1)
    .toNumber()
}

/**
 * @deprecated Use `calculateRealizedPnl`. Removed in the next major.
 */
export const realizedPnlOnClose = calculateRealizedPnl
