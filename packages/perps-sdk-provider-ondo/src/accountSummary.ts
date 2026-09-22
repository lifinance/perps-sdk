import { PerpsError } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  OndoAccountBalance,
} from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'

const ZERO_SUMMARY: AccountSummary = {
  portfolioValue: '0',
  availableMargin: '0',
  marginUsed: '0',
  unrealizedPnl: '0',
}

const ondoBalance = (
  account: AccountResponse
): OndoAccountBalance | undefined => {
  if (account.config.provider !== 'ondo') {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Ondo account summary received a '${account.config.provider}' account config`
    )
  }
  return account.config.balance
}

/**
 * Roll an Ondo account up into an {@link AccountSummary}, from the venue
 * balance figures the response carries. A logged-out account reads no venue
 * balance and summarizes as zero.
 *
 * @throws {PerpsError} `SDKError` when the account is not an Ondo one.
 * @public
 */
export function getAccountSummary(account: AccountResponse): AccountSummary {
  const balance = ondoBalance(account)
  if (balance === undefined) {
    return ZERO_SUMMARY
  }
  return {
    portfolioValue: balance.marginBalance,
    availableMargin: balance.availableMargin,
    marginUsed: balance.usedMargin,
    unrealizedPnl: balance.unrealizedPnl,
  }
}
