/**
 * Display-tier order formulas. Every function takes and gives decimal
 * strings; arithmetic is exact Big.js, with division to 40 decimal places.
 * Each formula throws `ValidationError` on an input that does not match the
 * decimal pattern and has a `safe*` pair that gives `undefined` in place of the throw.
 */

import {
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
import { DivBig } from '../decimal/big.js'
import {
  bigToDecimalString,
  decimalStringToBig,
  decimalStringToDivBig,
} from '../decimal/decimalStringToBig.js'
import { PerpsError } from '../errors/PerpsError.js'
import { createSafeFunction } from '../utils/createSafeFunction.js'
import {
  isActiveOrderStatus,
  isRegularOrder,
  isTriggerOrder,
} from '../utils/orderClassification.js'
import { invalidInput } from './invalidInput.js'
import { calculateRealizedPnl } from './position.js'

/**
 * Position size in asset units from margin: `marginUsd × leverage ÷ price`.
 *
 * @example
 * ```ts
 * calculateSize('100', '10', '2000') // '0.5' (ETH at $2000)
 * ```
 * @throws {PerpsError} `ValidationError` when an input does not match the decimal pattern
 *   or `price` is zero.
 * @public
 */
export function calculateSize(
  marginUsd: string,
  leverage: string,
  price: string
): string {
  const notional = decimalStringToDivBig(marginUsd).times(
    decimalStringToBig(leverage)
  )
  const priceBig = decimalStringToBig(price)
  if (priceBig.eq(0)) {
    throw invalidInput('price', 'must not be zero')
  }
  return bigToDecimalString(notional.div(priceBig))
}

/** @public */
export const safeCalculateSize = createSafeFunction(
  'calculateSize',
  calculateSize
)

/**
 * Estimated trading fee in USD: `sizeUsd × feeRate`.
 *
 * @param feeRate - Fee rate as a fraction (`'0.00035'` for 0.035%).
 * @throws {PerpsError} `ValidationError` when an input does not match the decimal pattern.
 * @public
 */
export function estimateFees(sizeUsd: string, feeRate: string): string {
  return bigToDecimalString(
    decimalStringToBig(sizeUsd).times(decimalStringToBig(feeRate))
  )
}

/** @public */
export const safeEstimateFees = createSafeFunction('estimateFees', estimateFees)

/**
 * Apply slippage to an order-entry price with exact decimal math: a buy
 * multiplies by `1 + slippagePercent / 100`, a sell divides by it. The result
 * is not rounded; snap it to the market tick before it goes to a venue.
 *
 * @param slippagePercent - Slippage tolerance as a percentage (`'0.5'` is 0.5%).
 * @throws {PerpsError} `ValidationError` when an input does not match the
 *   decimal pattern, or `slippagePercent` is -100 or less.
 * @public
 */
export function applySlippageToPrice(
  price: string,
  slippagePercent: string,
  isBuy: boolean
): string {
  const base = decimalStringToDivBig(price)
  const slippage = decimalStringToBig(slippagePercent)
  if (slippage.lte(-100)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid \`slippagePercent\`: ${slippagePercent}.`
    )
  }
  const multiplier = new DivBig(slippage).div(100).plus(1)
  return bigToDecimalString(
    isBuy ? base.times(multiplier) : base.div(multiplier)
  )
}

/** @public */
export const safeApplySlippageToPrice = createSafeFunction(
  'applySlippageToPrice',
  applySlippageToPrice
)

/**
 * Signed expected PnL for a trigger price — see {@link calculateExpectedPnl}.
 *
 * @public
 */
export interface ExpectedPnl {
  /** Signed expected profit/loss in USD. */
  amount: string
  /** Signed expected return as a percentage (`'10'` means 10%). */
  percent: string
}

/**
 * Expected gain or loss for a TP or SL trigger price. Positive is a profit,
 * negative a loss.
 *
 * @param entryPrice - Position entry or current market price.
 * @param margin - Margin amount in USD.
 * @throws {PerpsError} `ValidationError` when an input does not match the
 *   decimal pattern, or `triggerPrice`, `entryPrice` or `margin` is zero.
 * @public
 */
export function calculateExpectedPnl(
  triggerPrice: string,
  entryPrice: string,
  leverage: string,
  isLong: boolean,
  margin: string
): ExpectedPnl {
  const trigger = decimalStringToDivBig(triggerPrice)
  const entry = decimalStringToBig(entryPrice)
  const leverageBig = decimalStringToBig(leverage)
  const marginBig = decimalStringToBig(margin)
  if (trigger.eq(0)) {
    throw invalidInput('triggerPrice', 'must not be zero')
  }
  if (entry.eq(0)) {
    throw invalidInput('entryPrice', 'must not be zero')
  }
  if (marginBig.eq(0)) {
    throw invalidInput('margin', 'must not be zero')
  }
  const priceDiff = isLong
    ? trigger.minus(entry)
    : trigger.times(-1).plus(entry)
  const percent = priceDiff.div(entry).times(leverageBig).times(100)
  const amount = percent.times(marginBig).div(100)
  return {
    amount: bigToDecimalString(amount),
    percent: bigToDecimalString(percent),
  }
}

/** @public */
export const safeCalculateExpectedPnl = createSafeFunction(
  'calculateExpectedPnl',
  calculateExpectedPnl
)

/**
 * Trigger price that realises a percentage gain or loss.
 *
 * @param percent - Target gain or loss percentage (positive = profitable
 *   direction).
 * @throws {PerpsError} `ValidationError` when an input does not match the decimal pattern.
 * @public
 */
export function calculateTriggerPrice(
  percent: string,
  entryPrice: string,
  leverage: string,
  isLong: boolean
): string {
  const percentBig = decimalStringToDivBig(percent)
  const entry = decimalStringToBig(entryPrice)
  const leverageBig = decimalStringToBig(leverage)
  if (entry.eq(0)) {
    throw invalidInput('entryPrice', 'must not be zero')
  }
  if (leverageBig.eq(0)) {
    throw invalidInput('leverage', 'must not be zero')
  }
  const priceDelta = percentBig.times(entry).div(leverageBig.times(100))
  return bigToDecimalString(
    isLong ? entry.plus(priceDelta) : entry.minus(priceDelta)
  )
}

/** @public */
export const safeCalculateTriggerPrice = createSafeFunction(
  'calculateTriggerPrice',
  calculateTriggerPrice
)

/**
 * Percentage gain or loss that a trigger price realises.
 *
 * @throws {PerpsError} `ValidationError` when an input does not match the decimal pattern.
 * @public
 */
export function calculateTriggerPercent(
  price: string,
  entryPrice: string,
  leverage: string,
  isLong: boolean
): string {
  const priceBig = decimalStringToDivBig(price)
  const entry = decimalStringToBig(entryPrice)
  const leverageBig = decimalStringToBig(leverage)
  if (entry.eq(0)) {
    throw invalidInput('entryPrice', 'must not be zero')
  }
  if (leverageBig.eq(0)) {
    throw invalidInput('leverage', 'must not be zero')
  }
  const priceDiff = isLong
    ? priceBig.minus(entry)
    : priceBig.times(-1).plus(entry)
  return bigToDecimalString(priceDiff.div(entry).times(leverageBig).times(100))
}

/** @public */
export const safeCalculateTriggerPercent = createSafeFunction(
  'calculateTriggerPercent',
  calculateTriggerPercent
)

/**
 * Realized PnL as a percentage of the position value at close:
 * `realizedPnl ÷ (|size| × price) × 100`.
 *
 * @throws {PerpsError} `ValidationError` when an input does not match the
 *   decimal pattern or `size × price` is zero.
 * @public
 */
export function calculateRealizedPnlPercent(
  realizedPnl: string,
  size: string,
  price: string
): string {
  const pnl = decimalStringToDivBig(realizedPnl)
  const positionValue = decimalStringToBig(size)
    .abs()
    .times(decimalStringToBig(price))
  if (positionValue.eq(0)) {
    throw invalidInput('size × price', 'must not be zero')
  }
  return bigToDecimalString(pnl.div(positionValue).times(100))
}

/** @public */
export const safeCalculateRealizedPnlPercent = createSafeFunction(
  'calculateRealizedPnlPercent',
  calculateRealizedPnlPercent
)

/** Result of {@link walkOrderbook} — the fill obtained for a USD-notional walk. */
interface BookWalk {
  /** Base amount filled. */
  baseSize: string
  /** Notional actually filled in USD (equals the requested size unless the book ran dry). */
  filledNotional: string
  /** Volume-weighted average fill price, or `'0'` when the book is empty. */
  vwap: string
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
 * @throws {PerpsError} `ValidationError` when `sizeUsd` or a level's `price`
 *   or `size` does not match the decimal pattern.
 * @public
 */
export function walkOrderbook(
  levels: OrderbookLevel[],
  sizeUsd: string
): BookWalk {
  let remaining = decimalStringToDivBig(sizeUsd)
  let baseSize = new DivBig(0)
  let filledNotional = new DivBig(0)
  for (const level of levels) {
    if (remaining.lte(0)) {
      break
    }
    const price = decimalStringToDivBig(level.price)
    const levelNotional = decimalStringToBig(level.size).times(price)
    const take = remaining.lt(levelNotional) ? remaining : levelNotional
    if (take.eq(0)) {
      continue
    }
    filledNotional = filledNotional.plus(take)
    baseSize = baseSize.plus(take.div(price))
    remaining = remaining.minus(take)
  }
  return {
    baseSize: bigToDecimalString(baseSize),
    filledNotional: bigToDecimalString(filledNotional),
    vwap: baseSize.eq(0)
      ? '0'
      : bigToDecimalString(filledNotional.div(baseSize)),
    insufficientLiquidity: remaining.gt(0),
  }
}

/** @public */
export const safeWalkOrderbook = createSafeFunction(
  'walkOrderbook',
  walkOrderbook
)

/** Inputs to {@link buildQuote} — the resolved market, its live price, its book, and the trade ask. */
interface BuildQuoteInput {
  provider: string
  symbol: string
  type: TradeType
  side: QuoteSide
  sizeUsd: string
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
 * @throws {PerpsError} `ValidationError` when `sizeUsd`, the mark price, the
 *   taker fee or a book level does not match the decimal pattern.
 * @public
 */
export function buildQuote(input: BuildQuoteInput): Quote {
  const { market, price, side, sizeUsd, feeTier } = input
  const markPrice = decimalStringToDivBig(price.markPrice)
  const levels = side === 'buy' ? input.asks : input.bids
  const walk = walkOrderbook(levels, sizeUsd)
  const vwap = decimalStringToBig(walk.vwap)
  const priceImpactBps =
    markPrice.eq(0) || vwap.eq(0)
      ? '0'
      : bigToDecimalString(
          vwap.minus(markPrice).div(markPrice).abs().times(10_000)
        )
  return {
    provider: input.provider,
    symbol: input.symbol,
    marketId: market.id,
    type: input.type,
    side,
    sizeUsd: bigToDecimalString(decimalStringToBig(sizeUsd)),
    baseSize: walk.baseSize,
    markPrice: price.markPrice,
    expectedFillPrice: walk.vwap,
    priceImpactBps,
    feeTier,
    isDefaultFeeTier: true,
    feeUsd: estimateFees(walk.filledNotional, feeTier.taker),
    funding: price.funding ?? null,
    insufficientLiquidity: walk.insufficientLiquidity,
    timestamp: input.timestamp,
  }
}

/** @public */
export const safeBuildQuote = createSafeFunction('buildQuote', buildQuote)

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
 *
 * @throws {PerpsError} `ValidationError` when an input does not match the decimal pattern.
 * @public
 */
export function resolveCloseSize(
  orderSize: string,
  positionSize: string
): string {
  const order = decimalStringToBig(orderSize)
  const position = decimalStringToBig(positionSize)
  if (order.eq(0)) {
    return bigToDecimalString(position)
  }
  return bigToDecimalString(order.lt(position) ? order : position)
}

/** @public */
export const safeResolveCloseSize = createSafeFunction(
  'resolveCloseSize',
  resolveCloseSize
)

/**
 * Expected rPnL for a resting limit order against a matching position.
 *
 * Reducing requires opposite sides (long position + SELL, short position +
 * BUY). Same-side orders add to the position and have no rPnL → `undefined`.
 * Projects `remainingSize`, because an already-filled quantity has realised
 * its PnL at the fill price rather than at this order's limit price. A
 * `remainingSize` of zero leaves nothing to project.
 */
function regularOrderRealizedPnl(
  order: RegularOrder,
  position: Position | undefined
): string | undefined {
  if (!position || !isActiveOrderStatus(order.status)) {
    return undefined
  }

  const isLong = position.side === PositionSide.LONG
  const reducesPosition =
    (isLong && order.side === OrderSide.SELL) ||
    (!isLong && order.side === OrderSide.BUY)
  if (!reducesPosition) {
    return undefined
  }

  if (order.price === undefined) {
    return undefined
  }
  const orderSize = decimalStringToBig(order.remainingSize).abs()
  const positionSize = decimalStringToBig(position.size).abs()
  if (positionSize.lte(0)) {
    return undefined
  }

  // `resolveCloseSize` reads a zero size as "close the whole position", a
  // convention that belongs to an order's submitted size. `remainingSize` is
  // the unfilled quantity, so zero means nothing is left to fill.
  if (orderSize.eq(0)) {
    return undefined
  }

  return calculateRealizedPnl({
    entryPrice: position.entryPrice,
    closePrice: order.price,
    closeSize: resolveCloseSize(
      bigToDecimalString(orderSize),
      bigToDecimalString(positionSize)
    ),
    isLong,
  })
}

/** Project the unfilled closing quantity of an active trigger at its trigger price. */
function triggerOrderRealizedPnl(
  order: TriggerOrder,
  position: Position | undefined
): string | undefined {
  if (
    !position ||
    order.triggerPrice === undefined ||
    !isActiveOrderStatus(order.status) ||
    order.status === OrderStatus.PENDING
  ) {
    return undefined
  }

  const isLong = position.side === PositionSide.LONG
  if (
    (isLong && order.side !== OrderSide.SELL) ||
    (!isLong && order.side !== OrderSide.BUY)
  ) {
    return undefined
  }
  const orderSize = decimalStringToBig(order.remainingSize).abs()
  const positionSize = decimalStringToBig(position.size).abs()
  if (positionSize.lte(0)) {
    return undefined
  }
  if (
    orderSize.eq(0) &&
    (!decimalStringToBig(order.originalSize).eq(0) || !order.reduceOnly)
  ) {
    return undefined
  }

  return calculateRealizedPnl({
    entryPrice: position.entryPrice,
    closePrice: order.triggerPrice,
    closeSize: resolveCloseSize(
      bigToDecimalString(orderSize),
      bigToDecimalString(positionSize)
    ),
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
 *   `undefined`.
 * @throws {PerpsError} `ValidationError` when a price or size on the order or
 *   the position does not match the decimal pattern.
 * @public
 */
export function estimateRealizedPnl(
  order: Order,
  position: Position | undefined
): string | undefined {
  if (isTriggerOrder(order)) {
    return triggerOrderRealizedPnl(order, position)
  }
  if (isRegularOrder(order)) {
    return regularOrderRealizedPnl(order, position)
  }
  return undefined
}

/** @public */
export const safeEstimateRealizedPnl = createSafeFunction(
  'estimateRealizedPnl',
  estimateRealizedPnl
)
