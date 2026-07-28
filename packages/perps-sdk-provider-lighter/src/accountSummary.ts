import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'
import { MarginMode } from '@lifi/perps-types'
import Big from 'big.js'

/**
 * Roll a Lighter {@link AccountResponse} up into an {@link AccountSummary}.
 *
 * Lighter's cross available balance is already marked to market, while an
 * isolated position's unrealized PnL remains inside that position's isolated
 * sub-account. Reconciliation therefore adds every position's locked margin,
 * but adds unrealized PnL only for isolated positions.
 *
 * @public
 */
export function getAccountSummary(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  let availableMargin = new Big(0)
  for (const balance of account.collateralBalances) {
    availableMargin = availableMargin.plus(balance.valueUsd)
  }

  let nonCollateralValue = new Big(0)
  for (const balance of account.balances) {
    nonCollateralValue = nonCollateralValue.plus(balance.valueUsd)
  }

  let marginUsed = new Big(0)
  let unrealizedPnl = new Big(0)
  let isolatedUnrealizedPnl = new Big(0)
  for (const position of positions) {
    marginUsed = marginUsed.plus(position.marginUsed)
    unrealizedPnl = unrealizedPnl.plus(position.unrealizedPnl)
    if (position.marginMode === MarginMode.ISOLATED) {
      isolatedUnrealizedPnl = isolatedUnrealizedPnl.plus(position.unrealizedPnl)
    }
  }

  return {
    portfolioValue: nonCollateralValue
      .plus(availableMargin)
      .plus(marginUsed)
      .plus(isolatedUnrealizedPnl)
      .toString(),
    availableMargin: availableMargin.toString(),
    marginUsed: marginUsed.toString(),
    unrealizedPnl: unrealizedPnl.toString(),
  }
}
