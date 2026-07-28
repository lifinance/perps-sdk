/**
 * Return whether a Hyperliquid asset ID identifies spot (`@<pairIndex>`).
 * @param assetId - Raw Hyperliquid asset ID.
 * @public
 */
export const assetIsSpot = (assetId: string): boolean => assetId.startsWith('@')

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
