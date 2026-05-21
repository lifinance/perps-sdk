import type { Asset, AssetsResponse } from '@lifi/perps-types'
import { mapAsset } from '@lifi/perps-types/providers/hyperliquid'
import { fetchAllPerpAssetsRaw } from '../assetLookups.js'
import type { InfoRequestOptions } from '../infoClient.js'
import {
  getSpotAssetCtxs,
  getSpotPairs,
  type HlSpotAssetCtx,
  type SpotPairInfo,
} from '../spot.js'
import { buildMarketQuoteAssetMap, perpsDisplaySymbol } from '../subdexes.js'

const mapSpotAsset = (
  pair: SpotPairInfo,
  ctxMap: Map<string, HlSpotAssetCtx>,
  collateralCurrencies: Set<string>
): Asset => {
  const pairKey = `@${pair.pairIndex}`
  const pairName = `${pair.baseName}/${pair.quoteName}`
  const ctx = ctxMap.get(pairKey) ?? ctxMap.get(pairName)
  return {
    assetId: pairKey,
    market: 'spot',
    displaySymbol: pairName,
    displayQuote: null,
    isMarginCollateral:
      collateralCurrencies.has(pair.baseName) &&
      collateralCurrencies.has(pair.quoteName),
    logoURI: `https://app.hyperliquid.xyz/coins/${pair.baseName}_spot.svg`,
    szDecimals: pair.szDecimals,
    maxLeverage: 1,
    onlyIsolated: false,
    funding: { rate: '0', nextFundingTime: 0 },
    markPrice: ctx?.markPx ?? '0',
    prevDayPrice: ctx?.prevDayPx,
    volume24h: ctx?.dayNtlVlm,
  }
}

/**
 * Fetch all perps + spot assets supported by Hyperliquid, normalised into
 * `AssetsResponse`. Each perps entry is enriched with its provider market id
 * and the display symbol stripped of any sub-dex prefix; spot pairs are
 * surfaced under the `'spot'` market with `markPrice` / `volume24h` sourced
 * from `spotMetaAndAssetCtxs`.
 */
export const getAssets = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<AssetsResponse> => {
  const [raw, spotPairs, spotCtxMap, quoteAssetMap] = await Promise.all([
    fetchAllPerpAssetsRaw(apiUrl, options),
    getSpotPairs(apiUrl, options),
    getSpotAssetCtxs(apiUrl, options),
    buildMarketQuoteAssetMap(apiUrl, options),
  ])

  const assets: Asset[] = raw.map((m) => {
    const mapped = mapAsset(m.universe, m.assetCtx)
    return {
      ...mapped,
      market: m.providerMarketId,
      displaySymbol: perpsDisplaySymbol(mapped.assetId),
      displayQuote: quoteAssetMap.get(m.providerMarketId) ?? null,
    }
  })

  const collateralCurrencies = new Set(quoteAssetMap.values())
  for (const pair of spotPairs) {
    assets.push(mapSpotAsset(pair, spotCtxMap, collateralCurrencies))
  }

  return { assets }
}
