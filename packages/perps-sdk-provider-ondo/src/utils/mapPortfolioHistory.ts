import type {
  PortfolioHistoryRange,
  PortfolioHistoryResponse,
} from '@lifi/perps-types'
import type {
  OndoPortfolioGraphPoint,
  OndoPortfolioSummary,
} from '../types/wire.js'

const summaryVolume = (
  summary: OndoPortfolioSummary,
  range: PortfolioHistoryRange
): string | undefined => {
  switch (range) {
    case '7d':
      return summary.volume7d
    case '30d':
      return summary.volume30d
    case 'all':
      return summary.volumeAllTime
    case '24h':
      return undefined
  }
}

/**
 * Join the `/v1/portfolio/summary/graph` series with the `/v1/portfolio/summary`
 * totals for `range`. Ondo reports no 24-hour volume, so `volume` is absent
 * for `'24h'`.
 */
export const mapPortfolioHistory = (
  range: PortfolioHistoryRange,
  graph: OndoPortfolioGraphPoint[],
  summary: OndoPortfolioSummary
): PortfolioHistoryResponse => ({
  range,
  points: graph.map((point) => ({
    timestamp: Date.parse(point.time),
    accountValue: point.marginBalance,
    pnl: point.totalPnL,
  })),
  volume: summaryVolume(summary, range),
  totalPnl: summary.totalPnL,
})
