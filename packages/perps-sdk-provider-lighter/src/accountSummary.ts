import { summarizeAccount } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'

/**
 * Roll a Lighter {@link AccountResponse} up into an {@link AccountSummary}.
 * The collateral rows hold free collateral — `collateral` net of the cross
 * positions' locked margin, with all unrealized PnL and every locked
 * portion (cross requirements and isolated allocations) carried by the
 * positions — so both are added back for the portfolio value.
 *
 * @public
 */
export function getAccountSummary(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  return summarizeAccount(account, positions, 'free')
}
