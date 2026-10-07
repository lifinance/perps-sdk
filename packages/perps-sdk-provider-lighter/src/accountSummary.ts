import {
  addDecimalString,
  PerpsError,
  subtractDecimalString,
  unknownToDecimalString,
} from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  LighterAccountConfig,
  Position,
} from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
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
  perpsEquity: string,
  holdingValuesUsd: readonly string[]
): string =>
  holdingValuesUsd.reduce(
    (sum, valueUsd) =>
      addDecimalString(
        sum,
        unknownToDecimalString(valueUsd, 'valueUsd', LIGHTER_PROVIDER_KEY)
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

  return {
    portfolioValue: lighterPortfolioValue(
      addDecimalString(
        unknownToDecimalString(
          config.totalAssetValue,
          'totalAssetValue',
          LIGHTER_PROVIDER_KEY
        ),
        unknownToDecimalString(
          config.collateralSpotBalance,
          'collateralSpotBalance',
          LIGHTER_PROVIDER_KEY
        )
      ),
      holdings.map((balance) => balance.valueUsd)
    ),
    availableMargin: atLeastZero(
      subtractDecimalString(
        unknownToDecimalString(
          config.crossAssetValue,
          'crossAssetValue',
          LIGHTER_PROVIDER_KEY
        ),
        unknownToDecimalString(
          config.crossInitialMarginRequirement,
          'crossInitialMarginRequirement',
          LIGHTER_PROVIDER_KEY
        )
      )
    ),
    marginUsed: positions
      .map((p) => p.marginUsed)
      .reduce(addDecimalString, '0'),
    unrealizedPnl: positions
      .map((p) => p.unrealizedPnl)
      .reduce(addDecimalString, '0'),
  }
}
