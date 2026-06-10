import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'
import { stringToFloat } from './parse.js'

const sumValueUsd = (balances: AccountResponse['balances']): number =>
  balances.reduce((sum, b) => sum + stringToFloat(b.valueUsd), 0)

/**
 * Roll an {@link AccountResponse} and its open positions up into an
 * {@link AccountSummary}.
 *
 * @param collateralIsGross - `true` when the collateral rows already include
 * margin locked in positions, so free margin is collateral minus
 * `marginUsed`. `false` when the collateral rows hold free margin only and
 * the locked portion is carried by the positions' `marginUsed`.
 * @public
 */
export function summarizeAccount(
  account: AccountResponse,
  positions: Position[],
  collateralIsGross: boolean
): AccountSummary {
  let marginUsed = 0
  let unrealizedPnl = 0
  for (const p of positions) {
    marginUsed += stringToFloat(p.marginUsed)
    unrealizedPnl += stringToFloat(p.unrealizedPnl)
  }

  const collateral = sumValueUsd(account.collateralBalances)
  const balances = sumValueUsd(account.balances)

  const grossCollateral = collateralIsGross
    ? collateral
    : collateral + marginUsed

  return {
    portfolioValue: (balances + grossCollateral + unrealizedPnl).toString(),
    availableMargin: (grossCollateral - marginUsed).toString(),
    marginUsed: marginUsed.toString(),
    unrealizedPnl: unrealizedPnl.toString(),
  }
}
