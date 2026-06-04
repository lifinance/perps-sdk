import { stringToFloat } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'

const sumValueUsd = (balances: AccountResponse['balances']): number =>
  balances.reduce((sum, b) => sum + stringToFloat(b.valueUsd), 0)

/**
 * Roll a Lighter {@link AccountResponse} up into an {@link AccountSummary}.
 * Lighter has a single flat collateral model with no abstraction modes: the
 * collateral rows hold `available_balance` (free margin), so available margin
 * is the collateral as-is and the locked margin (carried by the positions'
 * `marginUsed`) is added back for the gross portfolio value.
 *
 * @public
 */
export function summarizeLighterAccount(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  let marginUsed = 0
  let unrealizedPnl = 0
  for (const p of positions) {
    marginUsed += stringToFloat(p.marginUsed)
    unrealizedPnl += stringToFloat(p.unrealizedPnl)
  }

  const collateral = sumValueUsd(account.collateralBalances)
  const balances = sumValueUsd(account.balances)

  return {
    portfolioValue: (
      balances +
      collateral +
      marginUsed +
      unrealizedPnl
    ).toString(),
    availableMargin: collateral.toString(),
    marginUsed: marginUsed.toString(),
    unrealizedPnl: unrealizedPnl.toString(),
  }
}
