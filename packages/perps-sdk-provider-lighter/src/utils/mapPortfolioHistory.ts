import {
  addDecimalString,
  buildPortfolioHistoryWindow,
  numberToDecimalString,
  subtractDecimalString,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type {
  PortfolioHistoryBounds,
  PortfolioHistoryRange,
  PortfolioHistoryResponse,
} from '@lifi/perps-types'
import { LIGHTER_PROVIDER_KEY } from '../constants.js'
import type { LtPnLEntry } from '../types/pnl.js'

const SNAPSHOT_DECIMAL_FIELDS = [
  'trade_pnl',
  'trade_spot_pnl',
  'inflow',
  'outflow',
  'spot_inflow',
  'spot_outflow',
  'volume',
] as const

type SnapshotDecimalField = (typeof SNAPSHOT_DECIMAL_FIELDS)[number]

const snapshotDecimal = (
  snapshot: LtPnLEntry,
  field: SnapshotDecimalField
): string => numberToDecimalString(snapshot[field])

function isValidSnapshot(snapshot: LtPnLEntry): boolean {
  const invalid = SNAPSHOT_DECIMAL_FIELDS.find(
    (field) => !Number.isFinite(snapshot[field])
  )
  if (invalid === undefined) {
    return true
  }
  warnSkippedVenueRow(
    LIGHTER_PROVIDER_KEY,
    'portfolio history',
    invalid,
    snapshot[invalid]
  )
  return false
}

function getCumulativePnl(snapshot: LtPnLEntry): string {
  return addDecimalString(
    snapshotDecimal(snapshot, 'trade_pnl'),
    snapshotDecimal(snapshot, 'trade_spot_pnl')
  )
}

function getCumulativeNetFlow(snapshot: LtPnLEntry): string {
  return subtractDecimalString(
    addDecimalString(
      subtractDecimalString(
        snapshotDecimal(snapshot, 'inflow'),
        snapshotDecimal(snapshot, 'outflow')
      ),
      snapshotDecimal(snapshot, 'spot_inflow')
    ),
    snapshotDecimal(snapshot, 'spot_outflow')
  )
}

/**
 * Derive window-relative history from Lighter's cumulative PnL snapshots.
 * Historical account values are anchored to the current account value. A
 * snapshot with a non-finite value is skipped. With `bounds`, the latest
 * snapshot at or before `start` is the opening, only the snapshots after
 * `start` through `end` are points, and `volume` counts the retained span.
 *
 * @throws {PerpsError} `ValidationError` when `currentValue` does not match the
 *   decimal pattern.
 */
export const mapPortfolioHistory = (
  range: PortfolioHistoryRange,
  snapshots: LtPnLEntry[],
  currentValue: string,
  bounds?: PortfolioHistoryBounds
): PortfolioHistoryResponse => {
  const orderedSnapshots = snapshots
    .filter(isValidSnapshot)
    .sort((a, b) => a.timestamp - b.timestamp)
  const firstSnapshot = orderedSnapshots[0]
  const latestSnapshot = orderedSnapshots.at(-1)
  if (!firstSnapshot || !latestSnapshot) {
    return {
      range,
      points: [],
      volume: '0',
      totalPnl: undefined,
    }
  }

  const firstPnl = getCumulativePnl(firstSnapshot)
  const firstNetFlow = getCumulativeNetFlow(firstSnapshot)
  const latestPnl = getCumulativePnl(latestSnapshot)
  const accountValueOffset = subtractDecimalString(
    subtractDecimalString(currentValue, latestPnl),
    getCumulativeNetFlow(latestSnapshot)
  )
  const points = orderedSnapshots.map((snapshot) => {
    const pnl = getCumulativePnl(snapshot)
    const netFlow = getCumulativeNetFlow(snapshot)
    return {
      timestamp: snapshot.timestamp * 1_000,
      accountValue: addDecimalString(
        addDecimalString(accountValueOffset, pnl),
        netFlow
      ),
      pnl: subtractDecimalString(pnl, firstPnl),
      netTransfers: subtractDecimalString(netFlow, firstNetFlow),
    }
  })

  if (bounds === undefined) {
    return {
      range,
      points,
      volume: subtractDecimalString(
        snapshotDecimal(latestSnapshot, 'volume'),
        snapshotDecimal(firstSnapshot, 'volume')
      ),
      totalPnl: points.at(-1)?.pnl,
    }
  }

  const window = buildPortfolioHistoryWindow(
    LIGHTER_PROVIDER_KEY,
    points,
    bounds
  )
  const firstRetained = window.opening ?? window.points[0]
  const lastRetained = window.points.at(-1) ?? window.opening
  const retainedSnapshots =
    firstRetained === undefined || lastRetained === undefined
      ? []
      : orderedSnapshots.filter(
          (snapshot) =>
            snapshot.timestamp * 1_000 >= firstRetained.timestamp &&
            snapshot.timestamp * 1_000 <= lastRetained.timestamp
        )
  const firstVolume = retainedSnapshots[0]
  const lastVolume = retainedSnapshots.at(-1)
  return {
    range,
    ...window,
    volume:
      firstVolume === undefined || lastVolume === undefined
        ? '0'
        : subtractDecimalString(
            snapshotDecimal(lastVolume, 'volume'),
            snapshotDecimal(firstVolume, 'volume')
          ),
    totalPnl: window.points.at(-1)?.pnl,
  }
}
