import type { Asset } from '@lifi/perps-types'
import { MAIN_DEX_NAME, MAIN_MARKET_ID } from '../constants.js'

/**
 * Derive the `AssetIdentity.market` value (a `/providers.markets[].id`) from
 * a Hyperliquid `assetId`:
 * - `"BTC"`      → main USDC perp dex → `"hyperliquid"`
 * - `"xyz:PURR"` → HIP-3 sub-dex      → `"xyz"`
 * - `"@142"`     → spot pair          → `"spot"`
 *
 * Must stay in lockstep with `lifi-perps-backend`'s `toProviderMarketId` /
 * `buildAssetMarketLookup` — they define the same `/providers.markets[].id`
 * taxonomy on the wire.
 */
export const deriveMarket = (assetId: string): string => {
  if (assetId.startsWith('@')) {
    return 'spot'
  }
  const colon = assetId.indexOf(':')
  if (colon > 0) {
    return assetId.slice(0, colon)
  }
  return 'hyperliquid'
}

/**
 * Distinct wire `dex` names to fan `clearinghouseState` / `frontendOpenOrders`
 * reads across, derived from the backend asset list. Spot is excluded (it has
 * no clearinghouseState); the main perp dex maps to the empty string.
 */
export const perpsDexNames = (assets: Asset[]): string[] => {
  const names = new Set<string>()
  for (const a of assets) {
    if (a.market === 'spot') {
      continue
    }
    names.add(a.market === MAIN_MARKET_ID ? MAIN_DEX_NAME : a.market)
  }
  return [...names]
}
