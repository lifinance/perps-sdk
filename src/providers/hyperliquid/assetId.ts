/**
 * Calculate the asset ID for a given provider index and asset index.
 *
 * Main provider (provider = ''): assetId = indexInProvider
 * HIP-3 providers (provider = 'xyz'): assetId = 100_000 + perpDexIndex * 10_000 + indexInProvider
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
 * Get the provider index from the given list of provider names.
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
