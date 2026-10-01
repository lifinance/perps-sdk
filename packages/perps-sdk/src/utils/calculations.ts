/**
 * Universal perpetual futures calculation utilities.
 *
 * Pure functions for computing position-related values that any consumer
 * of the perps SDK would need. All parameters are required — no default
 * values for critical financial parameters.
 */

import {
  type FeeTier,
  type Market,
  type MarketContext,
  type OrderbookLevel,
  PerpsErrorCode,
  type Quote,
  type QuoteSide,
  type TradeType,
} from '@lifi/perps-types'
import type Big from 'big.js'
import { PerpsError } from '../errors/PerpsError.js'
import { areFinite, DivBig } from './decimal.js'

/**
 * Calculate position size in asset units from margin.
 *
 * @param marginUsd - Margin amount in USD
 * @param leverage - Position leverage
 * @param price - Current asset price
 * @returns Position size in asset units
 * @example
 * ```ts
 * calculatePositionSize(100, 10, 2000) // 0.5 (ETH at $2000)
 * ```
 * @public
 */
export function calculatePositionSize(
  marginUsd: number,
  leverage: number,
  price: number
): number {
  if (price === 0) {
    return (marginUsd * leverage) / price
  }
  if (!areFinite(marginUsd, leverage, price)) {
    return Number.NaN
  }
  return new DivBig(marginUsd).times(leverage).div(price).toNumber()
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
 * Estimate trading fees.
 *
 * @param sizeUsd - Position size in USD (notional value)
 * @param feeRate - Fee rate as decimal (e.g., 0.00035 for 0.035%)
 * @returns Estimated fee in USD
 * @public
 */
export function estimateFees(sizeUsd: number, feeRate: number): number {
  if (!areFinite(sizeUsd, feeRate)) {
    return Number.NaN
  }
  return new DivBig(sizeUsd).times(feeRate).toNumber()
}

/**
 * Apply slippage to a price for order execution.
 *
 * @param price - Base price
 * @param slippagePercent - Slippage tolerance as percentage (e.g., 0.5 for 0.5%)
 * @param isBuy - True if buying (price goes up), false if selling (price goes down)
 * @returns Price adjusted for slippage
 * @public
 */
export function applySlippage(
  price: number,
  slippagePercent: number,
  isBuy: boolean
): number {
  if (!areFinite(price, slippagePercent)) {
    return Number.NaN
  }
  const multiplier = new DivBig(slippagePercent).div(100).plus(1)
  if (isBuy) {
    return new DivBig(price).times(multiplier).toNumber()
  }
  if (multiplier.eq(0)) {
    return price / multiplier.toNumber()
  }
  return new DivBig(price).div(multiplier).toNumber()
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
export function liquidationDistancePercent(params: {
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
 * Effective leverage of an open position.
 *
 * leverage = positionValueUsd / marginUsd
 *
 * @param positionValueUsd - Position notional value in USD
 * @param marginUsd - Margin backing the position in USD
 * @returns Effective leverage, or 0 when margin is zero
 * @public
 */
export function effectiveLeverage(params: {
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
 * Signed expected PnL for a trigger price — see {@link calculateExpectedPnl}.
 *
 * @public
 */
export interface ExpectedPnl {
  /** Signed expected profit/loss in USD. */
  amount: number
  /** Signed expected return as a percentage (10 means 10%). */
  percent: number
}

/**
 * Calculate expected gain/loss for a TP or SL trigger price.
 * Returns signed values — positive means profit, negative means loss.
 *
 * @param triggerPrice - The TP or SL target price
 * @param entryPrice - Position entry / current market price
 * @param leverage - Position leverage multiplier
 * @param isLong - True for long positions, false for short
 * @param margin - Margin amount in USD
 * @public
 */
export function calculateExpectedPnl(
  triggerPrice: number,
  entryPrice: number,
  leverage: number,
  isLong: boolean,
  margin: number
): ExpectedPnl | null {
  if (!triggerPrice || entryPrice === 0 || margin === 0) {
    return null
  }
  if (!areFinite(triggerPrice, entryPrice, leverage, margin)) {
    return { amount: Number.NaN, percent: Number.NaN }
  }
  const priceDiff = isLong
    ? new DivBig(triggerPrice).minus(entryPrice)
    : new DivBig(entryPrice).minus(triggerPrice)
  const percent = priceDiff.div(entryPrice).times(leverage).times(100)
  const amount = percent.times(margin).div(100)
  return { amount: amount.toNumber(), percent: percent.toNumber() }
}

/**
 * Convert a percentage gain/loss to a target price.
 *
 * @param percent - Target gain/loss percentage (positive = profitable direction)
 * @param entryPrice - Position entry price
 * @param leverage - Position leverage multiplier
 * @param isLong - True for long positions, false for short
 * @public
 */
export function priceFromPercent(
  percent: number,
  entryPrice: number,
  leverage: number,
  isLong: boolean
): number {
  if (entryPrice === 0 || leverage === 0) {
    return 0
  }
  if (!areFinite(percent, entryPrice, leverage)) {
    return Number.NaN
  }
  const priceDelta = new DivBig(percent)
    .times(entryPrice)
    .div(new DivBig(leverage).times(100))
  const entry = new DivBig(entryPrice)
  return (isLong ? entry.plus(priceDelta) : entry.minus(priceDelta)).toNumber()
}

/**
 * Convert a target price to a percentage gain/loss.
 *
 * @param price - Target price
 * @param entryPrice - Position entry price
 * @param leverage - Position leverage multiplier
 * @param isLong - True for long positions, false for short
 * @public
 */
export function percentFromPrice(
  price: number,
  entryPrice: number,
  leverage: number,
  isLong: boolean
): number {
  if (entryPrice === 0 || leverage === 0) {
    return 0
  }
  if (!areFinite(price, entryPrice, leverage)) {
    return Number.NaN
  }
  const priceDiff = isLong
    ? new DivBig(price).minus(entryPrice)
    : new DivBig(entryPrice).minus(price)
  return priceDiff.div(entryPrice).times(leverage).times(100).toNumber()
}

/**
 * Calculate realized PnL as a percentage of position value at close.
 *
 * @param realizedPnl - The realized profit/loss in USD
 * @param size - Position size in asset units at close
 * @param price - Price at close
 * @returns PnL as a percentage of position value
 * @public
 */
export function calculateRealizedPnlPercent(
  realizedPnl: number,
  size: number,
  price: number
): number {
  if (!areFinite(realizedPnl, size, price)) {
    return Number.NaN
  }
  const positionValue = new DivBig(size).abs().times(price)
  if (positionValue.eq(0)) {
    return 0
  }
  return new DivBig(realizedPnl).div(positionValue).times(100).toNumber()
}

/** Result of {@link walkOrderbook} — the fill obtained for a USD-notional walk. */
interface BookWalk {
  /** Base amount filled. */
  baseSize: number
  /** Notional actually filled in USD (equals the requested size unless the book ran dry). */
  filledNotional: number
  /** Volume-weighted average fill price, or 0 when the book is empty. */
  vwap: number
  /** True when the levels could not absorb the requested notional. */
  insufficientLiquidity: boolean
}

/**
 * Walk one side of an orderbook to fill `sizeUsd` notional, accumulating base
 * size and notional level-by-level to derive the VWAP fill. Levels are consumed
 * in array order — the caller passes asks for a buy and bids for a sell, each
 * already ordered best-price-first. When the book cannot absorb the full
 * notional, the walk stops at the last level and flags `insufficientLiquidity`,
 * returning the best obtainable fill.
 *
 * @throws {PerpsError} `ValidationError` when a level's `price` or `size`
 *   does not parse to a finite number.
 * @public
 */
export function walkOrderbook(
  levels: OrderbookLevel[],
  sizeUsd: number
): BookWalk {
  if (!Number.isFinite(sizeUsd)) {
    return {
      baseSize: Number.NaN,
      filledNotional: Number.NaN,
      vwap: Number.NaN,
      insufficientLiquidity: false,
    }
  }
  let remaining = new DivBig(sizeUsd)
  let baseSize = new DivBig(0)
  let filledNotional = new DivBig(0)
  for (const level of levels) {
    if (remaining.lte(0)) {
      break
    }
    const { price, size } = parseLevel(level)
    const levelNotional = size.times(price)
    const take = remaining.lt(levelNotional) ? remaining : levelNotional
    if (take.eq(0)) {
      continue
    }
    filledNotional = filledNotional.plus(take)
    baseSize = baseSize.plus(take.div(price))
    remaining = remaining.minus(take)
  }
  return {
    baseSize: baseSize.toNumber(),
    filledNotional: filledNotional.toNumber(),
    vwap: baseSize.eq(0) ? 0 : filledNotional.div(baseSize).toNumber(),
    insufficientLiquidity: remaining.gt(0),
  }
}

function parseLevel(level: OrderbookLevel): { price: Big; size: Big } {
  try {
    return { price: new DivBig(level.price), size: new DivBig(level.size) }
  } catch {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Malformed orderbook level: price='${level.price}', size='${level.size}'`
    )
  }
}

/** Inputs to {@link buildQuote} — the resolved market, its live price, its book, and the trade ask. */
interface BuildQuoteInput {
  provider: string
  symbol: string
  type: TradeType
  side: QuoteSide
  sizeUsd: number
  market: Market
  price: MarketContext
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  /** Public base-tier fees for the venue; `isDefaultFeeTier` is always set true. */
  feeTier: FeeTier
  timestamp: number
}

/**
 * Build a {@link Quote} from a resolved market, its live {@link MarketContext},
 * and its orderbook snapshot. Pure: walks the relevant side (buy → asks,
 * sell → bids) for the VWAP fill, derives the price impact in basis points
 * versus mark, applies the base taker fee on the filled notional, and carries
 * the market's `funding` (`null` for spot, which has none).
 *
 * @throws {PerpsError} `ValidationError` when a book level does not parse to
 *   a finite number — see {@link walkOrderbook}.
 * @public
 */
export function buildQuote(input: BuildQuoteInput): Quote {
  const { market, price, side, sizeUsd, feeTier } = input
  const markPrice = Number.parseFloat(price.markPrice)
  const levels = side === 'buy' ? input.asks : input.bids
  const walk = walkOrderbook(levels, sizeUsd)
  const priceImpactBps =
    markPrice === 0 || walk.vwap === 0
      ? 0
      : Math.abs((walk.vwap - markPrice) / markPrice) * 10_000
  const feeUsd = estimateFees(
    walk.filledNotional,
    Number.parseFloat(feeTier.taker)
  )
  return {
    provider: input.provider,
    symbol: input.symbol,
    marketId: market.id,
    type: input.type,
    side,
    sizeUsd: sizeUsd.toString(),
    baseSize: walk.baseSize.toString(),
    markPrice: price.markPrice,
    expectedFillPrice: walk.vwap.toString(),
    priceImpactBps: priceImpactBps.toString(),
    feeTier,
    isDefaultFeeTier: true,
    feeUsd: feeUsd.toString(),
    funding: price.funding ?? null,
    insufficientLiquidity: walk.insufficientLiquidity,
    timestamp: input.timestamp,
  }
}
