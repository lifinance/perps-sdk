import { summarizeAccount } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'

/**
 * Roll a Lighter {@link AccountResponse} up into an {@link AccountSummary}.
 * Lighter has a single flat collateral model with no abstraction modes: the
 * collateral rows hold `available_balance` (free margin), so available margin
 * is the collateral as-is and the locked margin (carried by the positions'
 * `marginUsed`) is added back for the gross portfolio value.
 *
 * @public
 */
export function getAccountSummary(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  return summarizeAccount(account, positions, false)
}
