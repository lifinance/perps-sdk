import { summarize } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'

/**
 * Lighter account roll-up. Balances are partitioned into `balances` /
 * `collateralBalances` with `valueUsd` filled by the provider's `getAccount`,
 * so the summary is provider-agnostic arithmetic.
 *
 * @public
 */
export function summarizeLighterAccount(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  return summarize(account, positions)
}
