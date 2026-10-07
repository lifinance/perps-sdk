import { PerpsError, requireVenueDecimal } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  LighterAccountConfig,
  Position,
} from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { atLeastZero } from './availableToTrade.js'
import {
  LIGHTER_COLLATERAL_ASSETS,
  LIGHTER_PROVIDER_KEY,
  LIGHTER_RH_PROVIDER_KEY,
} from './constants.js'

/**
 * The Lighter arm of `account.config`.
 *
 * @throws {PerpsError} `SDKError` when the account is not a Lighter one.
 */
export const lighterConfig = (
  account: AccountResponse
): LighterAccountConfig => {
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
 * Add marked holdings excluded from Lighter's settlement equity.
 */
export const lighterPortfolioValue = (
  perpsEquity: Big,
  holdingValuesUsd: readonly string[]
): Big =>
  holdingValuesUsd.reduce(
    (sum, valueUsd) =>
      sum.plus(
        new Big(requireVenueDecimal(valueUsd, 'valueUsd', LIGHTER_PROVIDER_KEY))
      ),
    perpsEquity
  )

/**
 * Roll up settlement equity, spot holdings and non-settlement margin holdings.
 * The settlement asset counts as `totalAssetValue` plus its spot-route balance,
 * so a row that pools both routes is not counted again.
 *
 * @throws {PerpsError} `SDKError` when the account is not a Lighter one.
 * @public
 */
export function getAccountSummary(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  const config = lighterConfig(account)
  const settlement = LIGHTER_COLLATERAL_ASSETS[config.provider]
  const holdings = [...account.balances, ...account.collateralBalances].filter(
    ({ asset }) =>
      asset.id !== String(settlement.assetIndex) &&
      asset.id !== settlement.displaySymbol
  )

  let marginUsed = new Big(0)
  let unrealizedPnl = new Big(0)
  for (const position of positions) {
    marginUsed = marginUsed.plus(position.marginUsed)
    unrealizedPnl = unrealizedPnl.plus(position.unrealizedPnl)
  }

  return {
    portfolioValue: lighterPortfolioValue(
      new Big(
        requireVenueDecimal(
          config.totalAssetValue,
          'totalAssetValue',
          LIGHTER_PROVIDER_KEY
        )
      ).plus(
        new Big(
          requireVenueDecimal(
            config.collateralSpotBalance,
            'collateralSpotBalance',
            LIGHTER_PROVIDER_KEY
          )
        )
      ),
      holdings.map((balance) => balance.valueUsd)
    ).toFixed(),
    availableMargin: atLeastZero(
      new Big(
        requireVenueDecimal(
          config.crossAssetValue,
          'crossAssetValue',
          LIGHTER_PROVIDER_KEY
        )
      ).minus(
        new Big(
          requireVenueDecimal(
            config.crossInitialMarginRequirement,
            'crossInitialMarginRequirement',
            LIGHTER_PROVIDER_KEY
          )
        )
      )
    ).toFixed(),
    marginUsed: marginUsed.toFixed(),
    unrealizedPnl: unrealizedPnl.toFixed(),
  }
}
