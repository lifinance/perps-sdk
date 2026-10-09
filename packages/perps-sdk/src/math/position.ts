/**
 * Display-tier position formulas and margin-adjustment predicates. Every
 * formula takes and gives decimal strings; arithmetic is exact Big.js, with
 * division to 40 decimal places. Each formula throws `ValidationError` on an
 * input that does not match the decimal pattern and has a `safe*` pair that gives
 * `undefined` in place of the throw.
 *
 * Sign convention: long = +1, short = -1. Sizes passed to the `estimate*`
 * helpers are always non-negative magnitudes; direction is carried by
 * `isLong`.
 */

import {
  MarginMode,
  type PerpsMarket,
  type Position,
  PositionMarginAdjustment,
} from '@lifi/perps-types'
import { DivBig } from '../decimal/big.js'
import {
  bigToDecimalString,
  decimalStringToBig,
  decimalStringToDivBig,
} from '../decimal/decimalStringToBig.js'
import { invalidInput } from '../errors/invalidInput.js'
import type { LiquidationEstimateParams } from '../types/provider.js'
import { createSafeFunction } from '../utils/createSafeFunction.js'

/**
 * Notional value of a position: `|size| × price`.
 *
 * @throws {PerpsError} `ValidationError` when an input does not match the decimal pattern.
 * @public
 */
export function calculateNotionalValue(size: string, price: string): string {
  return bigToDecimalString(
    decimalStringToBig(size).abs().times(decimalStringToBig(price))
  )
}

/** @public */
export const safeCalculateNotionalValue = createSafeFunction(
  'calculateNotionalValue',
  calculateNotionalValue
)

/**
 * Unrealized PnL: `(currentPrice - entryPrice) × size`, where `size` is
 * positive for a long and negative for a short.
 *
 * @throws {PerpsError} `ValidationError` when an input does not match the decimal pattern.
 * @public
 */
export function calculateUnrealizedPnl(
  entryPrice: string,
  currentPrice: string,
  size: string
): string {
  return bigToDecimalString(
    decimalStringToBig(currentPrice)
      .minus(decimalStringToBig(entryPrice))
      .times(decimalStringToBig(size))
  )
}

/** @public */
export const safeCalculateUnrealizedPnl = createSafeFunction(
  'calculateUnrealizedPnl',
  calculateUnrealizedPnl
)

/**
 * Return on equity as a percentage (`'10'` for 10%): `pnl ÷ margin × 100`.
 *
 * @throws {PerpsError} `ValidationError` when an input does not match the
 *   decimal pattern or `margin` is zero.
 * @public
 */
export function calculateRoe(pnl: string, margin: string): string {
  const marginBig = decimalStringToBig(margin)
  const pnlBig = decimalStringToDivBig(pnl)
  if (marginBig.eq(0)) {
    throw invalidInput('margin', 'must not be zero')
  }
  return bigToDecimalString(pnlBig.div(marginBig).times(100))
}

/** @public */
export const safeCalculateRoe = createSafeFunction('calculateRoe', calculateRoe)

/**
 * Required margin: `notionalValue ÷ leverage`.
 *
 * @throws {PerpsError} `ValidationError` when an input does not match the decimal pattern
 *   or `leverage` is zero.
 * @public
 */
export function calculateRequiredMargin(
  notionalValue: string,
  leverage: string
): string {
  const notionalBig = decimalStringToDivBig(notionalValue)
  const leverageBig = decimalStringToBig(leverage)
  if (leverageBig.eq(0)) {
    throw invalidInput('leverage', 'must not be zero')
  }
  return bigToDecimalString(notionalBig.div(leverageBig))
}

/** @public */
export const safeCalculateRequiredMargin = createSafeFunction(
  'calculateRequiredMargin',
  calculateRequiredMargin
)

/**
 * Distance from the current price to the liquidation price, as an absolute
 * percentage of the current price.
 *
 * @throws {PerpsError} `ValidationError` when an input does not match the
 *   decimal pattern or `currentPrice` is zero.
 * @public
 */
export function calculateLiquidationDistance(params: {
  liquidationPrice: string
  currentPrice: string
}): string {
  const liquidationPrice = decimalStringToDivBig(params.liquidationPrice)
  const currentPrice = decimalStringToBig(params.currentPrice)
  if (currentPrice.eq(0)) {
    throw invalidInput('currentPrice', 'must not be zero')
  }
  return bigToDecimalString(
    liquidationPrice.minus(currentPrice).div(currentPrice).abs().times(100)
  )
}

/** @public */
export const safeCalculateLiquidationDistance = createSafeFunction(
  'calculateLiquidationDistance',
  calculateLiquidationDistance
)

/**
 * Effective leverage of an open position: `positionValueUsd ÷ marginUsd`.
 *
 * @throws {PerpsError} `ValidationError` when an input does not match the
 *   decimal pattern or `marginUsd` is zero.
 * @public
 */
export function calculateEffectiveLeverage(params: {
  positionValueUsd: string
  marginUsd: string
}): string {
  const positionValue = decimalStringToDivBig(params.positionValueUsd)
  const margin = decimalStringToBig(params.marginUsd)
  if (margin.eq(0)) {
    throw invalidInput('marginUsd', 'must not be zero')
  }
  return bigToDecimalString(positionValue.div(margin))
}

/** @public */
export const safeCalculateEffectiveLeverage = createSafeFunction(
  'calculateEffectiveLeverage',
  calculateEffectiveLeverage
)

/**
 * Estimated liquidation price for an isolated-margin position, parameterised
 * by the venue's maintenance margin rate.
 *
 * Standard isolated-margin model (new position, no existing exposure):
 *   margin_available = entryPrice × (1 / leverage - mmr)
 *   liq_price        = entryPrice - side × margin_available / (1 - mmr × side)
 *
 * For existing positions, prefer `Position.liquidationPrice` from the venue.
 *
 * @param maintenanceMarginRate - Venue maintenance margin rate as a fraction
 *   (`'0.01'` = 1%).
 * @returns The estimate, or `undefined` when `1 / leverage` is at or below
 *   `maintenanceMarginRate`: the position opens at or past liquidation, so
 *   the model has no price on the correct side of entry.
 * @throws {PerpsError} `ValidationError` when an input does not match the
 *   decimal pattern, `leverage` is zero, or `maintenanceMarginRate` gives a
 *   zero denominator (`1` for a long, `-1` for a short).
 * @public
 */
export function estimateLiquidationPrice(params: {
  entryPrice: string
  leverage: string
  isLong: boolean
  maintenanceMarginRate: string
}): string | undefined {
  const entryPrice = decimalStringToBig(params.entryPrice)
  const leverage = decimalStringToBig(params.leverage)
  const mmr = decimalStringToBig(params.maintenanceMarginRate)
  const side = params.isLong ? 1 : -1
  const denominator = mmr.times(-side).plus(1)
  if (leverage.eq(0)) {
    throw invalidInput('leverage', 'must not be zero')
  }
  if (denominator.eq(0)) {
    throw invalidInput(
      'maintenanceMarginRate',
      `must not be ${params.isLong ? '1' : '-1'} for this side`
    )
  }
  const marginFractionAvailable = new DivBig(1).div(leverage).minus(mmr)
  if (marginFractionAvailable.lte(0)) {
    return undefined
  }
  const marginAvailable = marginFractionAvailable.times(entryPrice)
  return bigToDecimalString(
    entryPrice.minus(marginAvailable.times(side).div(denominator))
  )
}

/** @public */
export const safeEstimateLiquidationPrice = createSafeFunction(
  'estimateLiquidationPrice',
  estimateLiquidationPrice
)

/**
 * Estimate the liquidation price of a new isolated position from the flat
 * `market.maintenanceMarginRate`.
 *
 * @returns The estimate, or `undefined` when the market carries no
 *   `maintenanceMarginRate` or {@link estimateLiquidationPrice} gives
 *   `undefined`.
 * @throws {PerpsError} `ValidationError` on an input that
 *   {@link estimateLiquidationPrice} rejects.
 * @public
 */
export function estimateLiquidationPriceAtMarketRate(
  market: PerpsMarket,
  params: LiquidationEstimateParams
): string | undefined {
  if (market.maintenanceMarginRate === undefined) {
    return undefined
  }
  return estimateLiquidationPrice({
    entryPrice: params.entryPrice,
    leverage: params.leverage,
    isLong: params.isLong,
    maintenanceMarginRate: market.maintenanceMarginRate,
  })
}

/** @public */
export const safeEstimateLiquidationPriceAtMarketRate = createSafeFunction(
  'estimateLiquidationPriceAtMarketRate',
  estimateLiquidationPriceAtMarketRate
)

/**
 * Whether an isolated position with this liquidation price is already past
 * liquidation at `currentPrice`: a long liquidates when the price falls to its
 * liquidation level, a short when it rises to it. A non-positive price on
 * either side counts as unknown, so the result is `false`.
 *
 * @throws {PerpsError} `ValidationError` when a price does not match the decimal pattern.
 * @public
 */
export function wouldImmediatelyLiquidate(params: {
  liquidationPrice: string
  currentPrice: string
  isLong: boolean
}): boolean {
  const liquidationPrice = decimalStringToBig(params.liquidationPrice)
  const currentPrice = decimalStringToBig(params.currentPrice)
  if (currentPrice.lte(0) || liquidationPrice.lte(0)) {
    return false
  }
  return params.isLong
    ? liquidationPrice.gte(currentPrice)
    : liquidationPrice.lte(currentPrice)
}

/** @public */
export const safeWouldImmediatelyLiquidate = createSafeFunction(
  'wouldImmediatelyLiquidate',
  wouldImmediatelyLiquidate
)

/**
 * Estimated average entry price after adding to an existing position: the
 * size-weighted average of the current entry and the fill price. Both legs
 * are in the same direction (an add, not a flip).
 *
 * @param fillPrice - Expected fill price (mid for market, limit price for
 *   limit orders).
 * @throws {PerpsError} `ValidationError` when an input does not match the
 *   decimal pattern or `currentSize + addSize` is not positive.
 * @public
 */
export function estimateAverageEntryPrice(params: {
  currentSize: string
  currentEntry: string
  addSize: string
  fillPrice: string
}): string {
  const currentSize = decimalStringToDivBig(params.currentSize)
  const addSize = decimalStringToBig(params.addSize)
  const currentEntry = decimalStringToBig(params.currentEntry)
  const fillPrice = decimalStringToBig(params.fillPrice)
  const totalSize = currentSize.plus(addSize)
  if (totalSize.lte(0)) {
    throw invalidInput('currentSize + addSize', 'must be positive')
  }
  return bigToDecimalString(
    currentSize
      .times(currentEntry)
      .plus(addSize.times(fillPrice))
      .div(totalSize)
  )
}

/** @public */
export const safeEstimateAverageEntryPrice = createSafeFunction(
  'estimateAverageEntryPrice',
  estimateAverageEntryPrice
)

/**
 * Estimated effective leverage after adding margin and notional:
 * `(currentNotional + addNotional) ÷ (currentMargin + addMargin)`.
 *
 * @throws {PerpsError} `ValidationError` when an input does not match the
 *   decimal pattern or `currentMargin + addMargin` is not positive.
 * @public
 */
export function estimateNewLeverage(params: {
  currentNotional: string
  currentMargin: string
  addNotional: string
  addMargin: string
}): string {
  const totalNotional = decimalStringToDivBig(params.currentNotional).plus(
    decimalStringToBig(params.addNotional)
  )
  const totalMargin = decimalStringToBig(params.currentMargin).plus(
    decimalStringToBig(params.addMargin)
  )
  if (totalMargin.lte(0)) {
    throw invalidInput('currentMargin + addMargin', 'must be positive')
  }
  return bigToDecimalString(totalNotional.div(totalMargin))
}

/** @public */
export const safeEstimateNewLeverage = createSafeFunction(
  'estimateNewLeverage',
  estimateNewLeverage
)

/**
 * Estimated unrealised PnL at the mark price:
 * `(markPrice - entryPrice) × size × (isLong ? 1 : -1)`.
 *
 * @param size - Position size as a non-negative magnitude.
 * @throws {PerpsError} `ValidationError` when an input does not match the decimal pattern.
 * @public
 */
export function estimateUnrealizedPnl(params: {
  entryPrice: string
  markPrice: string
  size: string
  isLong: boolean
}): string {
  return bigToDecimalString(
    decimalStringToBig(params.markPrice)
      .minus(decimalStringToBig(params.entryPrice))
      .times(decimalStringToBig(params.size))
      .times(params.isLong ? 1 : -1)
  )
}

/** @public */
export const safeEstimateUnrealizedPnl = createSafeFunction(
  'estimateUnrealizedPnl',
  estimateUnrealizedPnl
)

/**
 * Realised PnL on the portion of a position being closed:
 * `(closePrice - entryPrice) × closeSize × (isLong ? 1 : -1)`.
 *
 * @param closeSize - Size being closed as a non-negative magnitude.
 * @throws {PerpsError} `ValidationError` when an input does not match the decimal pattern.
 * @public
 */
export function calculateRealizedPnl(params: {
  entryPrice: string
  closePrice: string
  closeSize: string
  isLong: boolean
}): string {
  return bigToDecimalString(
    decimalStringToBig(params.closePrice)
      .minus(decimalStringToBig(params.entryPrice))
      .times(decimalStringToBig(params.closeSize))
      .times(params.isLong ? 1 : -1)
  )
}

/** @public */
export const safeCalculateRealizedPnl = createSafeFunction(
  'calculateRealizedPnl',
  calculateRealizedPnl
)

/**
 * Whether this position can take a margin adjustment at all: it holds margin of
 * its own and its market exposes individual position margin.
 *
 * @public
 */
export function positionSupportsMarginAdjustment(position: Position): boolean {
  return (
    position.marginMode === MarginMode.ISOLATED &&
    position.market.positionMarginAdjustment !== PositionMarginAdjustment.NONE
  )
}

/**
 * Whether a removal is among the adjustments this position permits. An
 * `ADD_ONLY` market takes adds and no withdrawal.
 *
 * @public
 */
export function positionSupportsMarginRemoval(position: Position): boolean {
  return (
    positionSupportsMarginAdjustment(position) &&
    position.market.positionMarginAdjustment ===
      PositionMarginAdjustment.ADD_AND_REMOVE
  )
}
