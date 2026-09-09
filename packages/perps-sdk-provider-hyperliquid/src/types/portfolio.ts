// `portfolio` info response shapes.

/** `[Unix milliseconds, decimal string]` sample of one portfolio series. @public */
export type HlPortfolioSample = [number, string]

/**
 * One window of the Hyperliquid `portfolio` info response. `vlm` is the
 * traded volume in the window; `pnlHistory` is cumulative from its start.
 * @public
 */
export type HlPortfolioWindow = {
  accountValueHistory: HlPortfolioSample[]
  pnlHistory: HlPortfolioSample[]
  vlm: string
}

/** Hyperliquid `portfolio` window keys. @public */
export type HlPortfolioPeriod =
  | 'day'
  | 'week'
  | 'month'
  | 'allTime'
  | 'perpDay'
  | 'perpWeek'
  | 'perpMonth'
  | 'perpAllTime'

/** Hyperliquid `portfolio` info response: a list of `[period, window]` pairs. @public */
export type HlPortfolio = [HlPortfolioPeriod, HlPortfolioWindow][]
