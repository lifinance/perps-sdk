import { summarizeAccount } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'

/**
 * Roll a Lighter {@link AccountResponse} up into an {@link AccountSummary}.
 * Lighter has a single flat collateral model with no abstraction modes: the
 * collateral rows hold `available_balance`, which nets locked margin out but
 * marks unrealized PnL in — so only the positions' `marginUsed` is added
 * back for the portfolio value, never their PnL.
 *
 * @public
 */
export function getAccountSummary(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  return summarizeAccount(account, positions, 'net')
}
