import type {
  PortfolioHistoryBounds,
  PortfolioHistoryPoint,
} from '@lifi/perps-types'
import { subtractDecimalString } from '../decimal/arithmetic.js'
import { isDecimalString } from '../decimal/parse.js'
import { warnSkippedVenueRow } from '../utils/warnOnce.js'

/**
 * The samples of a bounded portfolio history read: the opening sample at or
 * before the start, when the venue has one, and the samples inside the bounds.
 * @public
 */
export interface PortfolioHistoryWindow {
  opening?: PortfolioHistoryPoint
  points: PortfolioHistoryPoint[]
}

const SAMPLE_ROW = 'portfolio history'

const isValidSample = (
  provider: string,
  point: PortfolioHistoryPoint
): boolean => {
  const invalid = (['accountValue', 'pnl'] as const).find(
    (field) => !isDecimalString(point[field])
  )
  if (invalid === undefined) {
    return true
  }
  warnSkippedVenueRow(provider, SAMPLE_ROW, invalid, point[invalid])
  return false
}

const buildRelativeSample = (
  point: PortfolioHistoryPoint,
  basis: PortfolioHistoryPoint
): PortfolioHistoryPoint => {
  const netTransfers =
    isDecimalString(point.netTransfers) && isDecimalString(basis.netTransfers)
      ? subtractDecimalString(point.netTransfers, basis.netTransfers)
      : undefined
  return {
    timestamp: point.timestamp,
    accountValue: point.accountValue,
    pnl: subtractDecimalString(point.pnl, basis.pnl),
    ...(netTransfers === undefined ? {} : { netTransfers }),
  }
}

/**
 * Cut venue samples to `bounds`. The latest valid sample at or before
 * `bounds.start` is the `opening`, and the valid samples after `bounds.start`
 * through `bounds.end` are the `points`, oldest first. `pnl` and
 * `netTransfers` are relative to the first retained sample, so that sample
 * carries `'0'` for both. A sample whose `accountValue` or `pnl` does not
 * match the decimal pattern is skipped with a warning. A retained sample
 * stays without `netTransfers` when it or the first retained sample has none.
 * Never throws.
 * @public
 */
export function buildPortfolioHistoryWindow(
  provider: string,
  points: PortfolioHistoryPoint[],
  bounds: PortfolioHistoryBounds
): PortfolioHistoryWindow {
  const ordered = points
    .filter((point) => isValidSample(provider, point))
    .sort((a, b) => a.timestamp - b.timestamp)
  let opening: PortfolioHistoryPoint | undefined
  const inBounds: PortfolioHistoryPoint[] = []
  for (const point of ordered) {
    if (point.timestamp <= bounds.start) {
      opening = point
    } else if (point.timestamp <= bounds.end) {
      inBounds.push(point)
    }
  }
  const basis = opening ?? inBounds[0]
  if (basis === undefined) {
    return { points: [] }
  }
  return {
    ...(opening === undefined
      ? {}
      : { opening: buildRelativeSample(opening, basis) }),
    points: inBounds.map((point) => buildRelativeSample(point, basis)),
  }
}
