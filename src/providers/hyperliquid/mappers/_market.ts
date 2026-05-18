/**
 * Derive the `AssetIdentity.market` value (a `/providers.markets[].id`) from
 * the canonical Hyperliquid `assetId` shape.
 *
 * The HL coin / universe identifier carries the sub-venue in the form:
 * - `"BTC"`            → main USDC perp dex          → `"hyperliquid"`
 * - `"xyz:PURR"`       → HIP-3 sub-dex (`xyz`)        → `"xyz"`
 * - `"@142"`           → spot pair (`@<pairIndex>`)   → `"spot"`
 *
 * This mirrors the backend's `toProviderMarketId(rawName)` mapping — the
 * empty wire name for the main perp dex becomes `"hyperliquid"`, sub-dex
 * names pass through verbatim, and the `@`-prefixed spot identity collapses
 * to a single `"spot"` market regardless of pair index.
 *
 * Keep this in lockstep with `lifi-perps-backend`'s
 * `toProviderMarketId` / `buildAssetMarketLookup`: those two surfaces define
 * the `/providers.markets[].id` taxonomy used by every cross-provider
 * consumer (widget routing, market badges, dex filters, etc.).
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
