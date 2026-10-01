import type {
  PortfolioHistoryRange,
  PortfolioHistoryResponse,
} from '@lifi/perps-types'
import Big from 'big.js'
import type { LtPnLEntry } from '../types/pnl.js'

function getCumulativePnl(snapshot: LtPnLEntry): Big {
  return new Big(snapshot.trade_pnl).plus(snapshot.trade_spot_pnl)
}

function getCumulativeNetFlow(snapshot: LtPnLEntry): Big {
  return new Big(snapshot.inflow)
    .minus(snapshot.outflow)
    .plus(snapshot.spot_inflow)
    .minus(snapshot.spot_outflow)
}

/**
 * Derive window-relative history from Lighter's cumulative PnL snapshots.
 * Historical account values are anchored to the current account value.
 */
export const mapPortfolioHistory = (
  range: PortfolioHistoryRange,
  snapshots: LtPnLEntry[],
  currentValue: Big
): PortfolioHistoryResponse => {
  const orderedSnapshots = [...snapshots].sort(
    (a, b) => a.timestamp - b.timestamp
  )
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
  const accountValueOffset = currentValue
    .minus(latestPnl)
    .minus(getCumulativeNetFlow(latestSnapshot))
  const points = orderedSnapshots.map((snapshot) => {
    const pnl = getCumulativePnl(snapshot)
    return {
      timestamp: snapshot.timestamp * 1_000,
      accountValue: accountValueOffset
        .plus(pnl)
        .plus(getCumulativeNetFlow(snapshot))
        .toFixed(),
      pnl: pnl.minus(firstPnl).toFixed(),
    }
  })

  return {
    range,
    points,
    volume: new Big(latestSnapshot.volume)
      .minus(firstSnapshot.volume)
      .toFixed(),
    totalPnl: points.at(-1)?.pnl,
  }
}
