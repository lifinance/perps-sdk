/** Lookback window of a portfolio history read. @public */
export type PortfolioHistoryRange = '24h' | '7d' | '30d' | 'all'

/**
 * One sample of the account's portfolio over time. All values are decimal
 * strings in USD.
 * @public
 */
export interface PortfolioHistoryPoint {
  /** Unix milliseconds. */
  timestamp: number
  accountValue: string
  /** Cumulative PnL from the start of the requested window. */
  pnl: string
}

/**
 * Account portfolio value over the requested window, oldest point first.
 * `volume` and `totalPnl` are window totals a venue may not report.
 * @public
 */
export interface PortfolioHistoryResponse {
  range: PortfolioHistoryRange
  points: PortfolioHistoryPoint[]
  volume?: string
  totalPnl?: string
}
