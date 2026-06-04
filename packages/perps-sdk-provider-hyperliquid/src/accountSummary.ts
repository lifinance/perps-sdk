import { stringToFloat } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'
import { HlAbstractionMode } from './types/index.js'

const sumValueUsd = (balances: AccountResponse['balances']): number =>
  balances.reduce((sum, b) => sum + stringToFloat(b.valueUsd), 0)

/**
 * In `unifiedAccount`/`portfolioMargin` the whole account lives in spot, so the
 * collateral rows are already gross holdings (locked margin included). In
 * `disabled`/`dexAbstraction` (and the unset/standard mode) the venue rows hold
 * `accountValue`, which Hyperliquid reports net of locked margin — i.e. free.
 */
const isUnifiedMode = (account: AccountResponse): boolean =>
  account.config.provider === 'hyperliquid' &&
  (account.config.abstractionMode === HlAbstractionMode.UNIFIED_ACCOUNT ||
    account.config.abstractionMode === HlAbstractionMode.PORTFOLIO_MARGIN)

/**
 * Roll a Hyperliquid {@link AccountResponse} up into an {@link AccountSummary},
 * branching on the abstraction mode so the gross/free meaning of the collateral
 * rows is interpreted correctly.
 *
 * @public
 */
export function summarizeHyperliquidAccount(
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

  const grossCollateral = isUnifiedMode(account)
    ? collateral
    : collateral + marginUsed

  return {
    portfolioValue: (balances + grossCollateral + unrealizedPnl).toString(),
    availableMargin: (grossCollateral - marginUsed).toString(),
    marginUsed: marginUsed.toString(),
    unrealizedPnl: unrealizedPnl.toString(),
  }
}
