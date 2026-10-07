import {
  addDecimalString,
  PerpsError,
  subtractDecimalString,
  unknownToDecimalString,
} from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  Balance,
  DecimalString,
  HyperliquidAccountConfig,
  Position,
} from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { PROVIDER_KEY } from './constants.js'
import { isUnifiedAbstraction } from './utils/abstractionMode.js'
import { perpsTotals, sumUnrealizedPnl } from './utils/venueTotals.js'

const sumValueUsd = (balances: readonly Balance[]): DecimalString =>
  balances.reduce(
    (sum, balance) =>
      addDecimalString(
        sum,
        unknownToDecimalString(
          balance.valueUsd,
          'balance.valueUsd',
          PROVIDER_KEY
        )
      ),
    '0'
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
  accountValue: DecimalString,
  marginUsed: DecimalString
): DecimalString => {
  if (!isUnifiedAbstraction(config.abstractionMode)) {
    return subtractDecimalString(accountValue, marginUsed)
  }
  if (config.availableAfterMaintenance === undefined) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Hyperliquid '${config.abstractionMode}' account carries no quote-asset entry in \`tokenToAvailableAfterMaintenance\``
    )
  }
  return unknownToDecimalString(
    config.availableAfterMaintenance,
    'tokenToAvailableAfterMaintenance',
    PROVIDER_KEY
  )
}

/**
 * Roll a Hyperliquid account and its open positions up into an
 * {@link AccountSummary}, from the venue figures the response carries.
 *
 * @throws {PerpsError} `SDKError` when the account is not a Hyperliquid one,
 * when a unified/portfolio-margin account carries no venue buying power, or
 * when a summed venue figure is not a decimal.
 * @public
 */
export function getAccountSummary(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  const config = hyperliquidConfig(account)
  const { accountValue, marginUsed } = perpsTotals(config.dexStates)

  return {
    portfolioValue: addDecimalString(
      sumValueUsd(account.collateralBalances),
      sumValueUsd(account.balances)
    ),
    availableMargin: getAvailableMargin(config, accountValue, marginUsed),
    marginUsed,
    unrealizedPnl: sumUnrealizedPnl(positions),
  }
}
