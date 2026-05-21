import { PerpsError } from '@lifi/perps-sdk'
import type { Asset } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { mapAsset } from '@lifi/perps-types/providers/hyperliquid'
import { fetchAllPerpAssetsRaw } from '../assetLookups.js'
import { PROVIDER_KEY } from '../constants.js'
import type { InfoRequestOptions } from '../infoClient.js'
import { buildMarketQuoteAssetMap, perpsDisplaySymbol } from '../subdexes.js'

export interface GetAssetParams {
  symbol: string
}

export const getAsset = async (
  apiUrl: string,
  params: GetAssetParams,
  options?: InfoRequestOptions
): Promise<Asset> => {
  const raw = await fetchAllPerpAssetsRaw(apiUrl, options)
  const found = raw.find((m) => m.universe.name === params.symbol)
  if (!found) {
    const err = new PerpsError(
      PerpsErrorCode.MarketNotFound,
      `Asset not found: ${params.symbol}`
    )
    err.tool = PROVIDER_KEY
    throw err
  }

  const quoteAssetMap = await buildMarketQuoteAssetMap(apiUrl, options)
  const mapped = mapAsset(found.universe, found.assetCtx)
  return {
    ...mapped,
    market: found.providerMarketId,
    displaySymbol: perpsDisplaySymbol(mapped.assetId),
    displayQuote: quoteAssetMap.get(found.providerMarketId) ?? null,
  }
}
