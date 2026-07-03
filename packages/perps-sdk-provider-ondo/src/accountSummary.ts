import { summarizeAccount } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'

/**
 * Roll an Ondo {@link AccountResponse} up into an {@link AccountSummary}.
 * Ondo's collateral row holds `walletBalance`, which includes locked margin
 * but not unrealized PnL (the positions carry it) — gross semantics: the
 * venue counts unrealized PnL toward buying power
 * (`availableMargin = marginBalance − usedMargin`).
 *
 * @public
 */
export function getAccountSummary(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  return summarizeAccount(account, positions, 'gross')
}
