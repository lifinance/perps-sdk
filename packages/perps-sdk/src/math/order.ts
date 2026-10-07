/**
 * Display-tier order formulas. Every function takes and gives `number`, except
 * `applySlippageToPrice`; exact decimal arithmetic happens internally with `DivBig`.
 */

import {
  type DecimalString,
  type FeeTier,
  type Market,
  type MarketContext,
  type Order,
  type OrderbookLevel,
  OrderSide,
  OrderStatus,
  PerpsErrorCode,
  type Position,
  PositionSide,
  type Quote,
  type QuoteSide,
  type RegularOrder,
  type TradeType,
  type TriggerOrder,
} from '@lifi/perps-types'
import type Big from 'big.js'
import { areFinite, DivBig } from '../decimal/big.js'
import { numberToDecimalString } from '../decimal/convert.js'
import { requireDecimal } from '../decimal/requireDecimal.js'
import { PerpsError } from '../errors/PerpsError.js'
import {
  isActiveOrderStatus,
  isRegularOrder,
  isTriggerOrder,
} from '../utils/orderClassification.js'
import { calculateRealizedPnl } from './position.js'

/**
 * Calculate position size in asset units from margin.
 *
 * @param marginUsd - Margin amount in USD
 * @param leverage - Position leverage
 * @param price - Current asset price
 * @returns Position size in asset units
 * @example
 * ```ts
 * calculateSize(100, 10, 2000) // 0.5 (ETH at $2000)
 * ```
 * @public
 */
export function calculateSize(
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
 * Apply slippage to an order-entry price with exact decimal math. The result
 * is not rounded; snap it to the market tick before it goes to a venue.
 *
 * @param slippagePercent - Slippage tolerance as a percentage (0.5 is 0.5%).
 * @throws {PerpsError} `ValidationError` when `price` is not a decimal string,
 *   or `slippagePercent` is not finite or is -100 or less.
 * @public
 */
export function applySlippageToPrice(
  price: DecimalString,
  slippagePercent: number,
  isBuy: boolean
): DecimalString {
  const base = requireDecimal(price, 'price')
  if (!Number.isFinite(slippagePercent) || slippagePercent <= -100) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid \`slippagePercent\`: ${slippagePercent}.`
    )
  }
  const multiplier = new DivBig(slippagePercent).div(100).plus(1)
  const adjusted = isBuy
    ? base.times(multiplier)
    : new DivBig(base).div(multiplier)
  return adjusted.eq(0) ? '0' : adjusted.toFixed()
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
 * Calculate the trigger price that realises a percentage gain/loss.
 *
 * @param percent - Target gain/loss percentage (positive = profitable direction)
 * @param entryPrice - Position entry price
 * @param leverage - Position leverage multiplier
 * @param isLong - True for long positions, false for short
 * @public
 */
export function calculateTriggerPrice(
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
 * Calculate the percentage gain/loss a trigger price realises.
 *
 * @param price - Target price
 * @param entryPrice - Position entry price
 * @param leverage - Position leverage multiplier
 * @param isLong - True for long positions, false for short
 * @public
 */
export function calculateTriggerPercent(
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
  /** True when the levels could not absorb the requested notional, and for a non-finite notional. */
  insufficientLiquidity: boolean
}

/**
 * Walk one side of an orderbook to fill `sizeUsd` notional, accumulating base
 * size and notional level-by-level to derive the VWAP fill. Levels are consumed
 * in array order — the caller passes asks for a buy and bids for a sell, each
 * already ordered best-price-first. When the book cannot absorb the full
 * notional, the walk stops at the last level and flags `insufficientLiquidity`,
 * returning the best obtainable fill. A non-finite `sizeUsd` gives NaN fill
 * fields with `insufficientLiquidity` set.
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
      insufficientLiquidity: true,
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
 *   a finite number — see {@link walkOrderbook} — or when a quoted figure is
 *   not finite (a non-finite `sizeUsd`, mark price or taker fee).
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
    sizeUsd: numberToDecimalString(sizeUsd),
    baseSize: numberToDecimalString(walk.baseSize),
    markPrice: price.markPrice,
    expectedFillPrice: numberToDecimalString(walk.vwap),
    priceImpactBps: numberToDecimalString(priceImpactBps),
    feeTier,
    isDefaultFeeTier: true,
    feeUsd: numberToDecimalString(feeUsd),
    funding: price.funding ?? null,
    insufficientLiquidity: walk.insufficientLiquidity,
    timestamp: input.timestamp,
  }
}

/**
 * Pick the matching open position for an order's market, if any.
 *
 * @param marketId - The order's `market.id`.
 * @param positions - Open positions list (any market).
 * @public
 */
export function findMatchingPosition(
  marketId: string,
  positions: readonly Position[]
): Position | undefined {
  return positions.find((p) => p.market.id === marketId)
}

/**
 * Resolve the close-size against a position, applying the spec's cap rules:
 *  - `orderSize === 0` is the Hyperliquid convention for "close entire
 *    position" → close the full position size.
 *  - Otherwise cap at the absolute position size; an order larger than the
 *    position can only close what's open.
 *
 * Inputs are non-negative magnitudes.
 * @public
 */
export function resolveCloseSize(
  orderSize: number,
  positionSize: number
): number {
  if (orderSize === 0) {
    return positionSize
  }
  return Math.min(orderSize, positionSize)
}

/**
 * Expected rPnL for a resting limit order against a matching position.
 *
 * Reducing requires opposite sides (long position + SELL, short position +
 * BUY). Same-side orders add to the position and have no rPnL → `null`.
 * Projects `remainingSize`, because an already-filled quantity has realised
 * its PnL at the fill price rather than at this order's limit price. A
 * `remainingSize` of zero leaves nothing to project.
 */
function regularOrderRealizedPnl(
  order: RegularOrder,
  position: Position | undefined
): number | null {
  if (!position || !isActiveOrderStatus(order.status)) {
    return null
  }

  const isLong = position.side === PositionSide.LONG
  const reducesPosition =
    (isLong && order.side === OrderSide.SELL) ||
    (!isLong && order.side === OrderSide.BUY)
  if (!reducesPosition) {
    return null
  }

  const limitPrice = Number.parseFloat(order.price ?? '')
  const entryPrice = Number.parseFloat(position.entryPrice)
  const orderSize = Math.abs(Number.parseFloat(order.remainingSize))
  const positionSize = Math.abs(Number.parseFloat(position.size))
  if (
    !Number.isFinite(limitPrice) ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(orderSize) ||
    !Number.isFinite(positionSize) ||
    positionSize <= 0
  ) {
    return null
  }

  // `resolveCloseSize` reads a zero size as "close the whole position", a
  // convention that belongs to an order's submitted size. `remainingSize` is
  // the unfilled quantity, so zero means nothing is left to fill.
  if (orderSize === 0) {
    return null
  }

  const closeSize = resolveCloseSize(orderSize, positionSize)
  return calculateRealizedPnl({
    entryPrice,
    closePrice: limitPrice,
    closeSize,
    isLong,
  })
}

/** Project the unfilled closing quantity of an active trigger at its trigger price. */
function triggerOrderRealizedPnl(
  order: TriggerOrder,
  position: Position | undefined
): number | null {
  if (
    !position ||
    !isActiveOrderStatus(order.status) ||
    order.status === OrderStatus.PENDING
  ) {
    return null
  }

  const isLong = position.side === PositionSide.LONG
  if (
    (isLong && order.side !== OrderSide.SELL) ||
    (!isLong && order.side !== OrderSide.BUY)
  ) {
    return null
  }
  const triggerPrice = Number.parseFloat(order.triggerPrice)
  const entryPrice = Number.parseFloat(position.entryPrice)
  const orderSize = Math.abs(Number.parseFloat(order.remainingSize))
  const positionSize = Math.abs(Number.parseFloat(position.size))
  if (
    !Number.isFinite(triggerPrice) ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(orderSize) ||
    !Number.isFinite(positionSize) ||
    positionSize <= 0
  ) {
    return null
  }
  if (
    orderSize === 0 &&
    (Number.parseFloat(order.originalSize) !== 0 || !order.reduceOnly)
  ) {
    return null
  }

  const closeSize = resolveCloseSize(orderSize, positionSize)
  return calculateRealizedPnl({
    entryPrice,
    closePrice: triggerPrice,
    closeSize,
    isLong,
  })
}

/**
 * Expected rPnL an unfilled order would realise against a matching position:
 * a resting limit order prices off its limit, an armed trigger off its trigger
 * price. A TWAP parent carries no single execution price, so it projects
 * nothing.
 *
 * @returns Realised PnL if the order would reduce the position, otherwise
 *   `null`.
 * @public
 */
export function estimateRealizedPnl(
  order: Order,
  position: Position | undefined
): number | null {
  if (isTriggerOrder(order)) {
    return triggerOrderRealizedPnl(order, position)
  }
  if (isRegularOrder(order)) {
    return regularOrderRealizedPnl(order, position)
  }
  return null
}
