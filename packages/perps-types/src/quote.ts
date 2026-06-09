import type { FeeTier } from './account.js'
import type { FundingInfo } from './market.js'

/** @public */
export type QuoteSide = 'buy' | 'sell'

/** @public */
export type TradeType = 'perps' | 'spot'

/**
 * One-shot fill estimate for a market order of `sizeUsd` notional on a single
 * venue: the VWAP fill walked from the orderbook, the price impact versus the
 * mark, the base-tier taker fee, and (for perps) the current funding rate.
 *
 * `priceImpactBps` is signed-magnitude basis points (1 bps = 0.01%) of the
 * VWAP fill's deviation from `markPrice` — always non-negative, since a buy
 * fills above mark and a sell below.
 * @public
 */
export interface Quote {
  provider: string
  /** Human `displaySymbol` the quote was resolved against, e.g. `"BTC"`. */
  symbol: string
  /** Opaque resolved `Market.id`. */
  marketId: string
  type: TradeType
  side: QuoteSide
  /** Input notional in USD. */
  sizeUsd: string
  /** Base amount the book filled for `sizeUsd` (or the most obtainable when the book is too thin). */
  baseSize: string
  markPrice: string
  /** Volume-weighted average fill price from the book walk. */
  expectedFillPrice: string
  /** VWAP deviation from `markPrice` in basis points; non-negative. */
  priceImpactBps: string
  /** Base maker/taker fee fractions (not bps) for the public tier. */
  feeTier: FeeTier
  /** Always `true` in v1 — quotes use the public base tier, never a per-account tier. */
  isDefaultFeeTier: boolean
  /** Taker fee on the filled notional in USD: `filledNotional * feeTier.taker`. */
  feeUsd: string
  /** Current funding for perps; `null` for spot. */
  funding: FundingInfo | null
  /** `true` when the book could not fill the full `sizeUsd` — `baseSize`/fill reflect the best obtainable. */
  insufficientLiquidity: boolean
  /** Unix milliseconds the quote was produced. */
  timestamp: number
}
