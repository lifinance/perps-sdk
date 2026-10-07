import {
  addDecimalString,
  numberToDecimalString,
  subtractDecimalString,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type {
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
 * snapshot with a non-finite value is skipped.
 *
 * @throws {PerpsError} `ValidationError` when `currentValue` is not a decimal
 *   string.
 */
export const mapPortfolioHistory = (
  range: PortfolioHistoryRange,
  snapshots: LtPnLEntry[],
  currentValue: string
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
  const latestPnl = getCumulativePnl(latestSnapshot)
  const accountValueOffset = subtractDecimalString(
    subtractDecimalString(currentValue, latestPnl),
    getCumulativeNetFlow(latestSnapshot)
  )
  const points = orderedSnapshots.map((snapshot) => {
    const pnl = getCumulativePnl(snapshot)
    return {
      timestamp: snapshot.timestamp * 1_000,
      accountValue: addDecimalString(
        addDecimalString(accountValueOffset, pnl),
        getCumulativeNetFlow(snapshot)
      ),
      pnl: subtractDecimalString(pnl, firstPnl),
    }
  })

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
