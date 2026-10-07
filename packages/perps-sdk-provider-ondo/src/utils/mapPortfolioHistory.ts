import { warnSkippedVenueRow } from '@lifi/perps-sdk'
import type {
  PortfolioHistoryPoint,
  PortfolioHistoryRange,
  PortfolioHistoryResponse,
} from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'
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

const POINT_ROW = 'portfolio point'

const mapPoint = (
  point: OndoPortfolioGraphPoint
): PortfolioHistoryPoint | undefined => {
  const timestamp = Date.parse(point.time)
  if (Number.isNaN(timestamp)) {
    warnSkippedVenueRow(ONDO_PROVIDER_KEY, POINT_ROW, 'time', point.time, {
      expected: 'timestamp',
    })
    return undefined
  }
  return { timestamp, accountValue: point.marginBalance, pnl: point.totalPnL }
}

/**
 * Join the `/v1/portfolio/summary/graph` series with the `/v1/portfolio/summary`
 * totals for `range`. Ondo reports no 24-hour volume, so `volume` is absent
 * for `'24h'`. `totalPnl` comes from the last graph point: the summary route
 * takes no range parameter, so its `totalPnL` is an all-time total. A point
 * with an invalid time is skipped.
 */
export const mapPortfolioHistory = (
  range: PortfolioHistoryRange,
  graph: OndoPortfolioGraphPoint[],
  summary: OndoPortfolioSummary
): PortfolioHistoryResponse => {
  const points = graph.flatMap((point) => mapPoint(point) ?? [])
  return {
    range,
    points,
    volume: summaryVolume(summary, range),
    totalPnl: points.at(-1)?.pnl,
  }
}
