import { PerpsError } from '@lifi/perps-sdk'
import type { AccountResponse, AccountSummary } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'

const ZERO_SUMMARY: AccountSummary = {
  portfolioValue: '0',
  availableMargin: '0',
  marginUsed: '0',
  unrealizedPnl: '0',
}

/**
 * Roll an Extended account up into an {@link AccountSummary} from the venue
 * balance figures. An account without credentials reads no balance and
 * summarizes as zero.
 *
 * @throws {PerpsError} `SDKError` for an account of another provider.
 * @public
 */
export function getAccountSummary(account: AccountResponse): AccountSummary {
  if (account.config.provider !== 'extended') {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Extended account summary received a '${account.config.provider}' account config`
    )
  }
  const balance = account.config.balance
  if (balance === undefined) {
    return ZERO_SUMMARY
  }
  return {
    portfolioValue: balance.equity,
    availableMargin: balance.availableForTrade,
    marginUsed: balance.initialMargin,
    unrealizedPnl: balance.unrealizedPnl,
  }
}
