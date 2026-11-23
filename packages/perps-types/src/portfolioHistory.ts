import type { DecimalString } from './decimal.js'

/** Lookback window of a portfolio history read. @public */
export type PortfolioHistoryRange = '24h' | '7d' | '30d' | 'all'

/**
 * Inclusive bounds of a bounded portfolio history read, in Unix milliseconds.
 * `range` still selects the venue preset or sample resolution; the bounds cut
 * the samples and ask for an opening sample at or before `start`.
 * @public
 */
export interface PortfolioHistoryBounds {
  start: number
  end: number
}

/**
 * One sample of the account's portfolio over time. All values are decimal
 * strings in USD.
 * @public
 */
export interface PortfolioHistoryPoint {
  /** Unix milliseconds. */
  timestamp: number
  accountValue: DecimalString
  /**
   * Cumulative PnL from the start of the requested window. On a bounded read,
   * relative to the first returned sample: the `opening` sample when present,
   * else the first point.
   */
  pnl: DecimalString
  /**
   * Cumulative net capital entering the sampled balances, in USD, relative to
   * the first returned sample (the `opening` sample of a bounded read when
   * present). Positive means inflow. The first value is '0'
   * when coverage is reliable. Absence means unavailable, not zero.
   * The sampled balances are the ones behind `accountValue`: perps-only for a
   * perps collateral account, spot and perps for a unified account. Opposite
   * movements between two samples cancel, so a value is net interval movement.
   */
  netTransfers?: DecimalString
}

/**
 * Account portfolio value over the requested window, oldest point first.
 * `volume` and `totalPnl` are window totals a venue may not report. On a
 * bounded read, `volume` keeps each venue's own span: the retained samples on
 * Lighter, the preset `range` on Hyperliquid and Ondo.
 * @public
 */
export interface PortfolioHistoryResponse {
  range: PortfolioHistoryRange
  /**
   * The latest valid sample at or before `bounds.start` of a bounded read.
   * Absent on an unbounded read, and when the venue has no such sample. An
   * absent opening never means a zero balance.
   */
  opening?: PortfolioHistoryPoint
  /** On a bounded read, only the valid samples after `start` through `end`. */
  points: PortfolioHistoryPoint[]
  volume?: DecimalString
  totalPnl?: DecimalString
}
