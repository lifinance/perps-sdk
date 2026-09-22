import { PerpsError } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  LighterAccountConfig,
  Position,
} from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { toRequiredBig } from './utils/decimal.js'

const lighterConfig = (account: AccountResponse): LighterAccountConfig => {
  if (account.config.provider !== 'lighter') {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Lighter account summary received a '${account.config.provider}' account config`
    )
  }
  return account.config
}

/**
 * Roll a Lighter account up into an {@link AccountSummary}, from the venue
 * figures the response carries. `totalAssetValue` is total equity and
 * `availableBalance` is buying power, so neither needs reconciling against the
 * positions; the positions supply only the margin and PnL breakdown.
 *
 * @throws {PerpsError} `SDKError` when the account is not a Lighter one.
 * @public
 */
export function getAccountSummary(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  const config = lighterConfig(account)

  let marginUsed = new Big(0)
  let unrealizedPnl = new Big(0)
  for (const position of positions) {
    marginUsed = marginUsed.plus(position.marginUsed)
    unrealizedPnl = unrealizedPnl.plus(position.unrealizedPnl)
  }

  return {
    // `total_asset_value` already covers every asset the venue prices, so the
    // spot `balances` rows must not be added on top of it.
    portfolioValue: toRequiredBig(
      config.totalAssetValue,
      'totalAssetValue'
    ).toString(),
    availableMargin: toRequiredBig(
      config.availableBalance,
      'availableBalance'
    ).toString(),
    marginUsed: marginUsed.toString(),
    unrealizedPnl: unrealizedPnl.toString(),
  }
}
