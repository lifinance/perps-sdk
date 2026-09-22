import type { HyperliquidDexAccountState } from '@lifi/perps-types'
import Big from 'big.js'
import { toWireBig } from './decimal.js'

/**
 * Sum the venue `marginSummary` totals over every perps sub-dex of an
 * account. `accountValue` is total equity, so it already carries locked
 * margin and unrealized PnL.
 * @public
 */
export const perpsTotals = (
  dexStates: readonly HyperliquidDexAccountState[]
): { accountValue: Big; marginUsed: Big } => {
  let accountValue = new Big(0)
  let marginUsed = new Big(0)
  for (const state of dexStates) {
    accountValue = accountValue.plus(
      toWireBig(state.marginSummary.accountValue, 'marginSummary.accountValue')
    )
    marginUsed = marginUsed.plus(
      toWireBig(
        state.marginSummary.totalMarginUsed,
        'marginSummary.totalMarginUsed'
      )
    )
  }
  return { accountValue, marginUsed }
}
