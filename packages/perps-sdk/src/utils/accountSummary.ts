import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'
import { stringToFloat } from './parse.js'

const sumValueUsd = (balances: AccountResponse['balances']): number =>
  balances.reduce((sum, b) => sum + stringToFloat(b.valueUsd), 0)

/**
 * What the summed `collateralBalances` rows already contain, relative to the
 * positions' locked margin and unrealized PnL:
 *
 * - `'free'` — free collateral only; locked margin and unrealized PnL are
<<<<<<< Updated upstream
 *   both carried by the positions. Available margin is the free collateral
 *   as-is; unrealized PnL is not counted toward it.
=======
 *   both carried by the positions.
 * - `'net'` — free collateral with unrealized PnL already marked in; only
 *   the locked margin is carried by the positions (e.g. a venue-reported
 *   available balance).
>>>>>>> Stashed changes
 * - `'gross'` — locked margin included, unrealized PnL carried by the
 *   positions (e.g. spot holdings backing a unified account). The venue
 *   counts unrealized PnL toward buying power, so it is added to available
 *   margin on top of the gross collateral.
 * - `'equity'` — total equity: locked margin AND unrealized PnL included
 *   (e.g. a venue-reported account value). Unrealized PnL is thus already
 *   counted toward available margin.
 *
 * @public
 */
export type CollateralSemantics = 'free' | 'net' | 'gross' | 'equity'

/**
 * Roll an {@link AccountResponse} and its open positions up into an
 * {@link AccountSummary}.
 *
 * @param semantics - How the collateral rows relate to the positions'
 * locked margin and unrealized PnL; see {@link CollateralSemantics}.
 * @public
 */
export function summarizeAccount(
  account: AccountResponse,
  positions: Position[],
  semantics: CollateralSemantics
): AccountSummary {
  let marginUsed = 0
  let unrealizedPnl = 0
  for (const p of positions) {
    marginUsed += stringToFloat(p.marginUsed)
    unrealizedPnl += stringToFloat(p.unrealizedPnl)
  }

  const collateral = sumValueUsd(account.collateralBalances)
  const balances = sumValueUsd(account.balances)

  const grossCollateral =
    semantics === 'free' || semantics === 'net'
      ? collateral + marginUsed
      : collateral
  const equity =
    semantics === 'equity' || semantics === 'net'
      ? grossCollateral
      : grossCollateral + unrealizedPnl

  // Buying power is equity net of locked margin, so unrealized PnL counts
  // toward it. The `'free'` rows exclude uPnL from available margin, holding
  // it purely as free collateral.
  const availableMargin =
    semantics === 'free' ? grossCollateral - marginUsed : equity - marginUsed

  return {
    portfolioValue: (balances + equity).toString(),
    availableMargin: availableMargin.toString(),
    marginUsed: marginUsed.toString(),
    unrealizedPnl: unrealizedPnl.toString(),
  }
}
