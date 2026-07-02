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
 *   both carried by the positions.
 * - `'gross'` — locked margin included, unrealized PnL carried by the
 *   positions (e.g. spot holdings backing a unified account).
 * - `'equity'` — total equity: locked margin AND unrealized PnL included
 *   (e.g. a venue-reported account value).
 *
 * @public
 */
export type CollateralSemantics = 'free' | 'gross' | 'equity'

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
    semantics === 'free' ? collateral + marginUsed : collateral
  const equity =
    semantics === 'equity' ? grossCollateral : grossCollateral + unrealizedPnl

  return {
    portfolioValue: (balances + equity).toString(),
    availableMargin: (grossCollateral - marginUsed).toString(),
    marginUsed: marginUsed.toString(),
    unrealizedPnl: unrealizedPnl.toString(),
  }
}
