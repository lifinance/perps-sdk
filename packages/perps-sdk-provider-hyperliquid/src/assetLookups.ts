import type {
  HlAssetCtx,
  HlMetaAndAssetCtxs,
  HlUniverseItem,
} from '@lifi/perps-types/providers/hyperliquid'
import { type InfoRequestOptions, infoRequest } from './infoClient.js'
import {
  buildSpotPairNameLookup,
  fetchSpotMetaAndAssetCtxs,
  getSpotPairs,
  type SpotPairInfo,
} from './spot.js'
import {
  buildMarketQuoteAssetMap,
  getSupportedSubDexes,
  perpsDisplaySymbol,
  toProviderMarketId,
} from './subdexes.js'

export interface AssetWithMeta {
  universe: HlUniverseItem
  assetCtx: HlAssetCtx
  dexIndex: number
  indexInDex: number
  providerMarketId: string
}

/**
 * Fetch the universe + per-asset context for every supported perps sub-dex,
 * skipping delisted entries. Results from each sub-dex are flattened into a
 * single array tagged with the originating dex index and provider market id.
 */
export const fetchAllPerpAssetsRaw = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<AssetWithMeta[]> => {
  const dexNames = await getSupportedSubDexes(apiUrl, options)
  const results = await Promise.all(
    dexNames.map((name) =>
      infoRequest<HlMetaAndAssetCtxs>(
        apiUrl,
        { type: 'metaAndAssetCtxs', ...(name ? { dex: name } : {}) },
        options
      )
    )
  )

  const out: AssetWithMeta[] = []
  for (let dexIndex = 0; dexIndex < results.length; dexIndex++) {
    const providerMarketId = toProviderMarketId(dexNames[dexIndex])
    const [meta, ctxs] = results[dexIndex]
    for (let i = 0; i < meta.universe.length; i++) {
      const universe = meta.universe[i]
      if (universe.isDelisted) {
        continue
      }
      out.push({
        universe,
        assetCtx: ctxs[i],
        dexIndex,
        indexInDex: i,
        providerMarketId,
      })
    }
  }
  return out
}

/**
 * Build a Map of `providerAssetId → providerMarketId`. Includes every perps
 * sub-dex asset plus the synthetic `'spot'` entries keyed by `@N`.
 */
export const buildAssetMarketLookup = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<Map<string, string>> => {
  const [raw, spotPairs] = await Promise.all([
    fetchAllPerpAssetsRaw(apiUrl, options),
    getSpotPairs(apiUrl, options),
  ])
  const entries: Array<readonly [string, string]> = []
  for (const m of raw) {
    entries.push([m.universe.name, m.providerMarketId])
  }
  for (const p of spotPairs) {
    entries.push([`@${p.pairIndex}`, 'spot'])
  }
  return new Map(entries)
}

/**
 * Lookup tables used to enrich an `AssetDisplay`. Memoise per provider call
 * and pass through to the per-field resolvers so we don't refetch metadata
 * for every position / order / fill in the response.
 */
export interface AssetEnrichmentMaps {
  assetMarketMap: Map<string, string>
  quoteAssetMap: Map<string, string>
  spotPairNameMap: Map<string, string>
}

const resolveSpotPairNamesFromPairs = (pairs: SpotPairInfo[]) => {
  const lookup = new Map<string, string>()
  for (const p of pairs) {
    lookup.set(`@${p.pairIndex}`, `${p.baseName}/${p.quoteName}`)
  }
  return lookup
}

export const resolveDisplaySymbol = (
  providerAssetId: string,
  maps: Pick<AssetEnrichmentMaps, 'assetMarketMap' | 'spotPairNameMap'>
): string => {
  const marketId = maps.assetMarketMap.get(providerAssetId)
  if (marketId === undefined) {
    return providerAssetId
  }
  if (marketId === 'spot') {
    return maps.spotPairNameMap.get(providerAssetId) ?? providerAssetId
  }
  return perpsDisplaySymbol(providerAssetId)
}

export const resolveDisplayQuote = (
  providerAssetId: string,
  maps: Pick<AssetEnrichmentMaps, 'assetMarketMap' | 'quoteAssetMap'>
): string | null => {
  const marketId = maps.assetMarketMap.get(providerAssetId)
  if (marketId === undefined || marketId === 'spot') {
    return null
  }
  return maps.quoteAssetMap.get(marketId) ?? null
}

/**
 * Build the bundle of lookups needed to enrich an `AssetDisplay` from a raw
 * Hyperliquid asset identifier. `quoteAssetMap` and `spotPairNameMap` are
 * passed in to allow the orchestrating service to share lookups across
 * positions / orders / fills in a single response.
 */
export const buildAssetEnrichmentMaps = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<AssetEnrichmentMaps> => {
  const [assetMarketMap, spotPairs, quoteAssetMap] = await Promise.all([
    buildAssetMarketLookup(apiUrl, options),
    getSpotPairs(apiUrl, options),
    buildMarketQuoteAssetMap(apiUrl, options),
  ])
  return {
    assetMarketMap,
    quoteAssetMap,
    spotPairNameMap: resolveSpotPairNamesFromPairs(spotPairs),
  }
}

export { buildSpotPairNameLookup, fetchSpotMetaAndAssetCtxs }
