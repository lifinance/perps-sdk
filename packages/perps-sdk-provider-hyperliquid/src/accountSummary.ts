import { type CollateralSemantics, summarizeAccount } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'
import { HlAbstractionMode } from './types/index.js'

/**
 * In `unifiedAccount`/`portfolioMargin` the whole account lives in spot, so
 * the collateral rows are gross holdings: locked margin included, unrealized
 * PnL carried by the positions. In `disabled`/`dexAbstraction` (and the
 * unset/standard mode) the venue rows hold `accountValue`, Hyperliquid's
 * total equity — locked margin AND unrealized PnL already included.
 */
const collateralSemantics = (account: AccountResponse): CollateralSemantics =>
  account.config.provider === 'hyperliquid' &&
  (account.config.abstractionMode === HlAbstractionMode.UNIFIED_ACCOUNT ||
    account.config.abstractionMode === HlAbstractionMode.PORTFOLIO_MARGIN)
    ? 'gross'
    : 'equity'

/**
 * Roll a Hyperliquid {@link AccountResponse} up into an {@link AccountSummary},
 * branching on the abstraction mode so the margin/PnL content of the
 * collateral rows is interpreted correctly.
 *
 * @public
 */
export function getAccountSummary(
  account: AccountResponse,
  positions: Position[]
): AccountSummary {
  return summarizeAccount(account, positions, collateralSemantics(account))
}
