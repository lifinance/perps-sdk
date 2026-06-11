import { summarizeAccount } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  Position,
} from '@lifi/perps-types'
import { HlAbstractionMode } from './types/index.js'

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
  return summarizeAccount(account, positions, isUnifiedMode(account))
}
