import { PerpsError, requireVenueDecimal } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  Balance,
  HyperliquidAccountConfig,
  Position,
} from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { PROVIDER_KEY } from './constants.js'
import { isUnifiedAbstraction } from './utils/abstractionMode.js'
import { perpsTotals, sumUnrealizedPnl } from './utils/venueTotals.js'

const sumValueUsd = (balances: readonly Balance[]): Big =>
  balances.reduce(
    (sum, balance) =>
      sum.plus(
        new Big(
          requireVenueDecimal(
            balance.valueUsd,
            'balance.valueUsd',
            PROVIDER_KEY
          )
        )
      ),
    new Big(0)
  )

const hyperliquidConfig = (
  account: AccountResponse
): HyperliquidAccountConfig => {
  if (account.config.provider !== 'hyperliquid') {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Hyperliquid account summary received a '${account.config.provider}' account config`
    )
  }
  return account.config
}

const getAvailableMargin = (
  config: HyperliquidAccountConfig,
  accountValue: Big,
  marginUsed: Big
): Big => {
  if (!isUnifiedAbstraction(config.abstractionMode)) {
    return accountValue.minus(marginUsed)
  }
  if (config.availableAfterMaintenance === undefined) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Hyperliquid '${config.abstractionMode}' account carries no quote-asset entry in \`tokenToAvailableAfterMaintenance\``
    )
  }
  return new Big(
    requireVenueDecimal(
      config.availableAfterMaintenance,
      'tokenToAvailableAfterMaintenance',
      PROVIDER_KEY
    )
  )
}

/**
 * Roll a Hyperliquid account and its open positions up into an
 * {@link AccountSummary}, from the venue figures the response carries.
 *
 * @throws {PerpsError} `SDKError` when the account is not a Hyperliquid one,
 * or when a unified/portfolio-margin account carries no venue buying power.
 * @public
 */
export function getAccountSummary(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  const config = hyperliquidConfig(account)
  const { accountValue, marginUsed } = perpsTotals(config.dexStates)

  return {
    portfolioValue: sumValueUsd(account.collateralBalances)
      .plus(sumValueUsd(account.balances))
      .toFixed(),
    availableMargin: getAvailableMargin(
      config,
      accountValue,
      marginUsed
    ).toFixed(),
    marginUsed: marginUsed.toFixed(),
    unrealizedPnl: sumUnrealizedPnl(positions).toFixed(),
  }
}
