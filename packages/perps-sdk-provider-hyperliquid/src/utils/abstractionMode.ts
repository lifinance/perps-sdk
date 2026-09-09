import { HlAbstractionMode } from '../types/account.js'

/**
 * Whether the mode holds the account's collateral in spot. Unified and
 * portfolio-margin accounts do; every other mode keeps perps collateral
 * per-dex, apart from the spot balances.
 */
export const isUnifiedAbstraction = (
  abstraction: HlAbstractionMode | null
): boolean =>
  abstraction === HlAbstractionMode.UNIFIED_ACCOUNT ||
  abstraction === HlAbstractionMode.PORTFOLIO_MARGIN
