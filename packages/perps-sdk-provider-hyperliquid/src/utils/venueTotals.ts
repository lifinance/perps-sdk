import type { HyperliquidMarginSummary, Position } from '@lifi/perps-types'
import Big from 'big.js'
import { toWireBig } from './decimal.js'

/**
 * One perps sub-dex entry {@link perpsTotals} reads. The REST response always
 * carries `marginSummary`; a WebSocket frame may omit it.
 * @public
 */
export interface DexMarginSummary {
  marginSummary?: HyperliquidMarginSummary
}

/**
 * Sum the venue `marginSummary` totals over every perps sub-dex of an
 * account. `accountValue` is total equity, so it already carries locked
 * margin and unrealized PnL. An entry without a `marginSummary` adds nothing.
 * @public
 */
export const perpsTotals = (
  dexStates: readonly DexMarginSummary[]
): { accountValue: Big; marginUsed: Big } => {
  let accountValue = new Big(0)
  let marginUsed = new Big(0)
  for (const { marginSummary } of dexStates) {
    if (marginSummary === undefined) {
      continue
    }
    accountValue = accountValue.plus(
      toWireBig(marginSummary.accountValue, 'marginSummary.accountValue')
    )
    marginUsed = marginUsed.plus(
      toWireBig(marginSummary.totalMarginUsed, 'marginSummary.totalMarginUsed')
    )
  }
  return { accountValue, marginUsed }
}

/**
 * Sum the unrealized PnL of every position, in quote-asset units.
 * @public
 */
export const sumUnrealizedPnl = (positions: readonly Position[]): Big =>
  positions.reduce(
    (sum, position) =>
      sum.plus(toWireBig(position.unrealizedPnl, 'position.unrealizedPnl')),
    new Big(0)
  )
