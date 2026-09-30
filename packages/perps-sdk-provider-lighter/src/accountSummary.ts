import { PerpsError } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  LighterAccountConfig,
  Position,
} from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { atLeastZero } from './availableToTrade.js'
import { LIGHTER_PROVIDER_KEY, LIGHTER_RH_PROVIDER_KEY } from './constants.js'
import { toRequiredBig } from './utils/decimal.js'

const lighterConfig = (account: AccountResponse): LighterAccountConfig => {
  const { config } = account
  if (
    config.provider !== LIGHTER_PROVIDER_KEY &&
    config.provider !== LIGHTER_RH_PROVIDER_KEY
  ) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Lighter account summary received a '${config.provider}' account config`
    )
  }
  return config
}

/**
 * Lighter portfolio value: the perps-route equity (`total_asset_value`) plus
 * the USD value of every spot-route holding, settlement asset included.
 */
export const lighterPortfolioValue = (
  perpsEquity: Big,
  spotValuesUsd: readonly string[]
): Big =>
  spotValuesUsd.reduce(
    (sum, valueUsd) => sum.plus(toRequiredBig(valueUsd, 'valueUsd')),
    perpsEquity
  )

/**
 * Roll a Lighter account up into an {@link AccountSummary}. `totalAssetValue`
 * is perps-route equity and excludes the spot route, so `portfolioValue` adds
 * every spot `balances` row, settlement included; the `collateralBalances` rows
 * are the perps-route holding already inside `totalAssetValue`.
 * `availableMargin` is the cross free collateral, floored at 0: an isolated
 * position's equity stays with that position until the user removes it. The
 * positions supply only the margin and PnL breakdown.
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
    portfolioValue: lighterPortfolioValue(
      toRequiredBig(config.totalAssetValue, 'totalAssetValue'),
      account.balances.map((balance) => balance.valueUsd)
    ).toFixed(),
    availableMargin: atLeastZero(
      toRequiredBig(config.crossAssetValue, 'crossAssetValue').minus(
        toRequiredBig(
          config.crossInitialMarginRequirement,
          'crossInitialMarginRequirement'
        )
      )
    ).toFixed(),
    marginUsed: marginUsed.toFixed(),
    unrealizedPnl: unrealizedPnl.toFixed(),
  }
}
