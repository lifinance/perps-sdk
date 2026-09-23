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
 * Roll a Lighter account up into an {@link AccountSummary}. `totalAssetValue`
 * is perps-route equity and excludes the spot route, so `portfolioValue` adds
 * every spot `balances` row, settlement included; the `collateralBalances` row
 * is buying power already inside `totalAssetValue`. The positions supply only
 * the margin and PnL breakdown.
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

  let portfolioValue = toRequiredBig(config.totalAssetValue, 'totalAssetValue')
  for (const balance of account.balances) {
    portfolioValue = portfolioValue.plus(
      toRequiredBig(balance.valueUsd, 'valueUsd')
    )
  }

  return {
    portfolioValue: portfolioValue.toFixed(),
    availableMargin: toRequiredBig(
      config.availableBalance,
      'availableBalance'
    ).toFixed(),
    marginUsed: marginUsed.toFixed(),
    unrealizedPnl: unrealizedPnl.toFixed(),
  }
}
