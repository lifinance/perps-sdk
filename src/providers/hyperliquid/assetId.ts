/**
 * Calculate the asset ID for a given DEX index and asset index.
 *
 * Main DEX (dex = ''): assetId = indexInDex
 * HIP-3 DEXes (dex = 'xyz'): assetId = 100_000 + perpDexIndex * 10_000 + indexInDex
 */
export const calculateAssetId = (
  dexIndex: number,
  indexInDex: number
): number => {
  if (dexIndex === 0) {
    return indexInDex
  }
  return 100_000 + dexIndex * 10_000 + indexInDex
}

/**
 * Get the DEX index from the given list of dex names.
 */
export const getDexIndex = (dex: string, dexNames: string[]): number => {
  const index = dexNames.indexOf(dex)
  if (index === -1) {
    throw new Error(`Unknown sub-dex: ${dex}`)
  }
  return index
}
