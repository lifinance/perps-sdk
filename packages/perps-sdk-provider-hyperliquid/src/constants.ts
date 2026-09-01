import type { FeeTier } from '@lifi/perps-types'

/**
 * Hyperliquid provider key (exported from the package index as
 * `HYPERLIQUID_PROVIDER_KEY`).
 *
 * @public
 */
export const PROVIDER_KEY = 'hyperliquid'

/**
 * Default Hyperliquid REST base URL.
 *
 * @public
 */
export const DEFAULT_HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz'

/**
 * Approximate published baseline maker/taker fee tier for Hyperliquid, used to
 * seed fee math before the live account `feeTier` resolves. Rates are fractions
 * (not basis points): `0.00015` = 0.015% maker, `0.00045` = 0.045% taker.
 *
 * @public
 */
export const HYPERLIQUID_FEE_TIER_FALLBACK: FeeTier = {
  maker: '0.00015',
  taker: '0.00045',
}

/** @internal */
export const DEFAULT_HISTORY_LIMIT = 50
/** @internal */
export const MAX_HISTORY_LIMIT = 200

/**
 * Main perps DEX uses an empty sub-dex name on the wire; surfaced as
 * 'hyperliquid' in normalised market IDs.
 *
 * @internal
 */
export const MAIN_DEX_NAME = ''
/** @internal */
export const MAIN_MARKET_ID = 'hyperliquid'
/** @internal */
export const SPOT_MARKET_ID = 'spot'
