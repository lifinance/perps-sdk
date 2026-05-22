import type { AssetPrice, PricesResponse } from '@lifi/perps-types'
import type { HlAllMids } from '../types/index.js'
import { type InfoRequestOptions, infoRequest } from '../utils/infoClient.js'
import { getSupportedSubDexes } from '../utils/subdexes.js'

export interface GetPricesParams {
  /** Optional client-side filter against the merged `assetId` set. */
  symbols?: string[]
}

/**
 * Fetch latest mid prices for every market across all supported perps
 * sub-dexes. Sub-dex results are concatenated into a single flat `prices`
 * array in `perpDexs` order. If the same `assetId` appears in multiple
 * dexes the order of the resulting entries follows the iteration order; no
 * deduplication is performed (HL uses dex-prefixed assetIds for HIP-3
 * markets so collisions only occur for the main perps DEX).
 */
export const getPrices = async (
  apiUrl: string,
  params: GetPricesParams = {},
  options?: InfoRequestOptions
): Promise<PricesResponse> => {
  const dexNames = await getSupportedSubDexes(apiUrl, options)
  const results = await Promise.all(
    dexNames.map((name) =>
      infoRequest<HlAllMids>(
        apiUrl,
        { type: 'allMids', ...(name ? { dex: name } : {}) },
        options
      )
    )
  )

  const prices: AssetPrice[] = []
  for (const mids of results) {
    for (const [assetId, price] of Object.entries(mids)) {
      prices.push({ assetId, price })
    }
  }

  const filtered =
    params.symbols !== undefined
      ? prices.filter((p) => params.symbols!.includes(p.assetId))
      : prices

  return { prices: filtered }
}
