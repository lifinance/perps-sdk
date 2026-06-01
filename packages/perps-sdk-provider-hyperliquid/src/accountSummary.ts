import { summarize } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'

/**
 * Hyperliquid account roll-up. Balances are already normalised to gross
 * holdings and partitioned into `balances` / `collateralBalances` by the
 * provider's `getAccount`, so the summary is provider-agnostic arithmetic.
 */
export function summarizeHyperliquidAccount(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  return summarize(account, positions)
}
