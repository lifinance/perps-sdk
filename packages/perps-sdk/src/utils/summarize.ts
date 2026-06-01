import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'
import { stringToFloat } from './parse.js'

const sumValueUsd = (balances: AccountResponse['balances']): number =>
  balances.reduce((sum, b) => sum + stringToFloat(b.valueUsd), 0)

/**
 * Provider-agnostic account roll-up. Pure arithmetic over the response's
 * `balances` / `collateralBalances` partition — the provider plugin has
 * already determined collateral and filled `Balance.valueUsd`, so the
 * computation is identical for every provider (no provider/mode branch).
 *
 * - `availableMargin = Σ collateralBalances.valueUsd − marginUsed`
 * - `portfolioValue  = Σ balances.valueUsd + Σ collateralBalances.valueUsd + unrealizedPnl`
 * - `marginUsed` / `unrealizedPnl` are summed over positions.
 */
export function summarize(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  let marginUsed = 0
  let unrealizedPnl = 0
  for (const p of positions) {
    marginUsed += stringToFloat(p.marginUsed)
    unrealizedPnl += stringToFloat(p.unrealizedPnl)
  }

  const collateralValue = sumValueUsd(account.collateralBalances)
  const balancesValue = sumValueUsd(account.balances)

  return {
    portfolioValue: (
      balancesValue +
      collateralValue +
      unrealizedPnl
    ).toString(),
    availableMargin: (collateralValue - marginUsed).toString(),
    marginUsed: marginUsed.toString(),
    unrealizedPnl: unrealizedPnl.toString(),
  }
}
