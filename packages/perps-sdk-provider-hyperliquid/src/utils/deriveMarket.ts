import type { Asset, Market, MarketDisplay } from '@lifi/perps-types'
import {
  MAIN_DEX_NAME,
  MAIN_MARKET_ID,
  PROVIDER_KEY,
  SPOT_MARKET_ID,
} from '../constants.js'

/** Hyperliquid quotes every market in USDC. */
const QUOTE_SYMBOL = 'USDC'

/**
 * Derive the `categoryId` (a `Provider.categories[].id`) from a Hyperliquid
 * market id:
 * - `"BTC"`      → main USDC perp dex → `"hyperliquid"`
 * - `"xyz:PURR"` → HIP-3 sub-dex      → `"xyz"`
 * - `"@142"`     → spot pair          → `"spot"`
 *
 * Must stay in lockstep with `lifi-perps-backend`'s `toProviderMarketId` /
 * `buildAssetMarketLookup` — they define the same category taxonomy on the wire.
 * @public
 */
export const deriveMarket = (marketId: string): string => {
  if (marketId.startsWith('@')) {
    return SPOT_MARKET_ID
  }
  const colon = marketId.indexOf(':')
  if (colon > 0) {
    return marketId.slice(0, colon)
  }
  return MAIN_MARKET_ID
}

const coinAsset = (symbol: string): Asset => ({
  providerId: PROVIDER_KEY,
  id: symbol,
  displaySymbol: symbol,
  logoURI: `https://app.hyperliquid.xyz/coins/${symbol}.svg`,
})

/**
 * Build a {@link MarketDisplay} for a Hyperliquid market id, synthesising the
 * base/quote token {@link Asset}s from the venue coin string (HL prices every
 * market in USDC). Embedded on `Position`/`Fill`/`Order`.
 * @public
 */
export const marketDisplayFromCoin = (coin: string): MarketDisplay => ({
  providerId: PROVIDER_KEY,
  id: coin,
  categoryId: deriveMarket(coin),
  baseAsset: coinAsset(coin),
  quoteAsset: coinAsset(QUOTE_SYMBOL),
})

/**
 * Distinct wire `dex` names to fan `clearinghouseState` / `frontendOpenOrders`
 * reads across, derived from the backend market list. Spot is excluded (it has
 * no clearinghouseState); the main perp dex maps to the empty string.
 * @public
 */
export const perpsDexNames = (markets: Market[]): string[] => {
  const names = new Set<string>()
  for (const m of markets) {
    if (m.categoryId === SPOT_MARKET_ID) {
      continue
    }
    names.add(m.categoryId === MAIN_MARKET_ID ? MAIN_DEX_NAME : m.categoryId)
  }
  return [...names]
}
