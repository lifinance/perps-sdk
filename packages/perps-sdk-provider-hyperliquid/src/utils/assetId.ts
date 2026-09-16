/**
 * Return whether a Hyperliquid asset ID identifies spot (`@<pairIndex>`).
 * @param assetId - Raw Hyperliquid asset ID.
 * @public
 */
export const assetIsSpot = (assetId: string): boolean => assetId.startsWith('@')

/** Lowest numeric asset ID Hyperliquid assigns to an outcome market. */
const OUTCOME_ASSET_ID_BASE = 100_000_000

/**
 * Return whether a Hyperliquid asset identity belongs to an HIP-4 outcome
 * market: spot coin `#<encoding>`, token name `+<encoding>`, or numeric asset
 * ID `100000000 + encoding`. LI.FI supports no outcome market, and the backend
 * market list holds none, so the provider skips every such identity.
 * @param assetId - Raw Hyperliquid coin, token name, or numeric asset ID.
 * @public
 */
export const assetIsOutcome = (assetId: string | number): boolean =>
  typeof assetId === 'number'
    ? assetId >= OUTCOME_ASSET_ID_BASE
    : assetId.startsWith('#') || assetId.startsWith('+')

/**
 * Calculate Hyperliquid's numeric asset ID from a perp DEX index and the
 * asset's zero-based index within that DEX. The main DEX uses the index
 * directly; HIP-3 DEXes use `100000 + dexIndex * 10000 + assetIndex`.
 * @public
 */
export const calculateAssetId = (
  providerIndex: number,
  indexInProvider: number
): number => {
  if (providerIndex === 0) {
    return indexInProvider
  }
  return 100_000 + providerIndex * 10_000 + indexInProvider
}

/**
 * Find a sub-DEX's zero-based index in the names returned by Hyperliquid.
 * @throws If `provider` is absent from `providerNames`.
 * @public
 */
export const getProviderIndex = (
  provider: string,
  providerNames: string[]
): number => {
  const index = providerNames.indexOf(provider)
  if (index === -1) {
    throw new Error(`Unknown sub-provider: ${provider}`)
  }
  return index
}
