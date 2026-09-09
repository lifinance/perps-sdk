import type {
  PortfolioHistoryRange,
  PortfolioHistoryResponse,
} from '@lifi/perps-types'
import Big from 'big.js'
import type { LtPnLEntry } from '../types/pnl.js'

/**
 * Build the portfolio series from Lighter PnL buckets and the account's
 * current value. Lighter reports no historical account value, so each
 * point's `accountValue` is `currentValue` with every later bucket's
 * `trade_pnl + inflow - outflow` removed. `pnl` is the running
 * `trade_pnl + trade_spot_pnl`.
 */
export const mapPortfolioHistory = (
  range: PortfolioHistoryRange,
  entries: LtPnLEntry[],
  currentValue: Big
): PortfolioHistoryResponse => {
  const ordered = [...entries].sort((a, b) => a.timestamp - b.timestamp)

  const accountValues: Big[] = []
  let value = currentValue
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    accountValues[i] = value
    const entry = ordered[i]
    value = value
      .minus(new Big(entry.trade_pnl))
      .minus(new Big(entry.inflow))
      .plus(new Big(entry.outflow))
  }

  let pnl = new Big(0)
  let volume = new Big(0)
  const points = ordered.map((entry, i) => {
    pnl = pnl.plus(new Big(entry.trade_pnl)).plus(new Big(entry.trade_spot_pnl))
    volume = volume.plus(new Big(entry.volume))
    return {
      timestamp: entry.timestamp,
      accountValue: accountValues[i].toFixed(),
      pnl: pnl.toFixed(),
    }
  })

  return {
    range,
    points,
    volume: volume.toFixed(),
    totalPnl: points.at(-1)?.pnl,
  }
}
