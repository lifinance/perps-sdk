import type { FeeTier } from '@lifi/perps-types'

export const PROVIDER_KEY = 'hyperliquid'

export const DEFAULT_HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz'

/**
 * Approximate published baseline maker/taker fee tier for Hyperliquid, used to
 * seed fee math before the live account `feeTier` resolves. Rates are fractions
 * (not basis points): `0.00015` = 0.015% maker, `0.00045` = 0.045% taker.
 */
export const HYPERLIQUID_FEE_TIER_FALLBACK: FeeTier = {
  maker: '0.00015',
  taker: '0.00045',
}

export const MAX_CANDLE_LIMIT = 1000
export const DEFAULT_CANDLE_LIMIT = 100
export const DEFAULT_OHLCV_LOOKBACK_MS = 24 * 60 * 60 * 1000
export const MAX_ORDERBOOK_DEPTH = 100
export const DEFAULT_HISTORY_LIMIT = 50
export const MAX_HISTORY_LIMIT = 200
export const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

/** Main perps DEX uses an empty sub-dex name on the wire; surfaced as 'hyperliquid' in normalised market IDs. */
export const MAIN_DEX_NAME = ''
export const MAIN_MARKET_ID = 'hyperliquid'
export const SPOT_MARKET_ID = 'spot'
