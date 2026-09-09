import { PerpsError } from '@lifi/perps-sdk'
import {
  PerpsErrorCode,
  type PortfolioHistoryRange,
  type PortfolioHistoryResponse,
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

const pointTimestamp = (time: string): number => {
  const parsed = Date.parse(time)
  if (Number.isNaN(parsed)) {
    throw new PerpsError(
      PerpsErrorCode.ThirdPartyError,
      `Ondo portfolio graph point carries an unparsable time '${time}'.`
    )
  }
  return parsed
}

/**
 * Join the `/v1/portfolio/summary/graph` series with the `/v1/portfolio/summary`
 * totals for `range`. Ondo reports no 24-hour volume, so `volume` is absent
 * for `'24h'`. `totalPnl` comes from the last graph point: the summary route
 * takes no range parameter, so its `totalPnL` is an all-time total.
 */
export const mapPortfolioHistory = (
  range: PortfolioHistoryRange,
  graph: OndoPortfolioGraphPoint[],
  summary: OndoPortfolioSummary
): PortfolioHistoryResponse => {
  const points = graph.map((point) => ({
    timestamp: pointTimestamp(point.time),
    accountValue: point.marginBalance,
    pnl: point.totalPnL,
  }))
  return {
    range,
    points,
    volume: summaryVolume(summary, range),
    totalPnl: points.at(-1)?.pnl,
  }
}
