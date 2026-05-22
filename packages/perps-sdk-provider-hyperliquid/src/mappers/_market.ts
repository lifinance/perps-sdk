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
