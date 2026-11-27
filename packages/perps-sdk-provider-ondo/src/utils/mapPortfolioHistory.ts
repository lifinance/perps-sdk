import {
  buildPortfolioHistoryWindow,
  isDecimalString,
  safeSubtractDecimalString,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type {
  PortfolioHistoryBounds,
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
  point: OndoPortfolioGraphPoint,
  baseline: string | undefined
): PortfolioHistoryPoint | undefined => {
  const timestamp = Date.parse(point.time)
  if (Number.isNaN(timestamp)) {
    warnSkippedVenueRow(ONDO_PROVIDER_KEY, POINT_ROW, 'time', point.time, {
      expected: 'timestamp',
    })
    return undefined
  }
  const netFlow = getCumulativeNetFlow(point)
  const netTransfers =
    baseline === undefined || netFlow === undefined
      ? undefined
      : safeSubtractDecimalString(netFlow, baseline)
  return {
    timestamp,
    accountValue: point.marginBalance,
    pnl: point.totalPnL,
    ...(netTransfers === undefined ? {} : { netTransfers }),
  }
}

const getCumulativeNetFlow = (
  point: OndoPortfolioGraphPoint
): string | undefined =>
  isDecimalString(point.allTimeDeposits) &&
  isDecimalString(point.allTimeWithdrawals)
    ? safeSubtractDecimalString(point.allTimeDeposits, point.allTimeWithdrawals)
    : undefined

/**
 * Join the `/v1/portfolio/summary/graph` series with the `/v1/portfolio/summary`
 * totals for `range`. Ondo reports no 24-hour volume, so `volume` is absent
 * for `'24h'`. `totalPnl` comes from the last graph point: the summary route
 * takes no range parameter, so its `totalPnL` is an all-time total. A point
 * with an invalid time is skipped. With `bounds`, the graph can come from a
 * wider preset than `range`: the latest point at or before `start` is the
 * opening, and only the points after `start` through `end` remain.
 */
export const mapPortfolioHistory = (
  range: PortfolioHistoryRange,
  graph: OndoPortfolioGraphPoint[],
  summary: OndoPortfolioSummary,
  bounds?: PortfolioHistoryBounds
): PortfolioHistoryResponse => {
  const first = graph.find((point) => !Number.isNaN(Date.parse(point.time)))
  const baseline = first === undefined ? undefined : getCumulativeNetFlow(first)
  const points = graph.flatMap((point) => mapPoint(point, baseline) ?? [])
  if (bounds === undefined) {
    return {
      range,
      points,
      volume: summaryVolume(summary, range),
      totalPnl: points.at(-1)?.pnl,
    }
  }
  const window = buildPortfolioHistoryWindow(ONDO_PROVIDER_KEY, points, bounds)
  return {
    range,
    ...window,
    volume: summaryVolume(summary, range),
    totalPnl: window.points.at(-1)?.pnl,
  }
}
