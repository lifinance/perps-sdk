import type { HlPerpDexs } from '@lifi/perps-types/providers/hyperliquid'
import { MAIN_DEX_NAME, MAIN_MARKET_ID, SPOT_MARKET_ID } from './constants.js'
import { type InfoRequestOptions, infoRequest } from './infoClient.js'
import { buildSpotTokenByIndex } from './spot.js'

const fetchPerpDexs = (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<HlPerpDexs> =>
  infoRequest<HlPerpDexs>(apiUrl, { type: 'perpDexs' }, options)

/**
 * Returns the list of supported sub-provider wire names. The main perps DEX
 * is represented by `''` and any HIP-3 sub-dex by its `name` field.
 */
export const getSupportedSubDexes = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<string[]> => {
  const dexs = await fetchPerpDexs(apiUrl, options)
  return dexs.map((d) => (d === null ? MAIN_DEX_NAME : d.name))
}

interface MetaCollateral {
  collateralToken: number
}

export interface ProviderMarket {
  id: string
  quoteAsset: string | null
}

/**
 * Returns the list of provider markets — every perps sub-dex (`''` mapped to
 * `'hyperliquid'`) plus the synthetic `'spot'` market — with each market's
 * collateral / quote asset symbol where applicable.
 */
export const getProviderMarkets = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<ProviderMarket[]> => {
  const [perpDexs, spotTokens] = await Promise.all([
    fetchPerpDexs(apiUrl, options),
    buildSpotTokenByIndex(apiUrl, options),
  ])

  const dexNames = perpDexs.map((d) => (d === null ? MAIN_DEX_NAME : d.name))

  const metaResults = await Promise.allSettled(
    dexNames.map((name) =>
      infoRequest<[MetaCollateral, ...unknown[]]>(
        apiUrl,
        { type: 'metaAndAssetCtxs', ...(name ? { dex: name } : {}) },
        options
      )
    )
  )

  const markets: ProviderMarket[] = perpDexs.map((entry, i) => {
    const name = entry === null ? MAIN_DEX_NAME : entry.name
    let quoteAsset: string | null = 'USDC'
    const metaResult = metaResults[i]
    if (metaResult.status === 'fulfilled') {
      const tokenIndex = metaResult.value[0].collateralToken
      quoteAsset = spotTokens.get(tokenIndex) ?? 'USDC'
    }
    return {
      id: name === MAIN_DEX_NAME ? MAIN_MARKET_ID : name,
      quoteAsset,
    }
  })

  markets.push({ id: SPOT_MARKET_ID, quoteAsset: null })
  return markets
}

/**
 * Returns a Map of `providerMarketId → quoteAsset`. Markets without a quote
 * asset (e.g. `'spot'`) are omitted.
 */
export const buildMarketQuoteAssetMap = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<Map<string, string>> => {
  const markets = await getProviderMarkets(apiUrl, options)
  return new Map(
    markets
      .filter(
        (m): m is ProviderMarket & { quoteAsset: string } =>
          m.quoteAsset !== null
      )
      .map((m) => [m.id, m.quoteAsset])
  )
}

/** Map a raw sub-dex name to a providerMarketId (`'' → 'hyperliquid'`). */
export const toProviderMarketId = (rawName: string): string =>
  rawName === MAIN_DEX_NAME ? MAIN_MARKET_ID : rawName

/**
 * Strip the sub-dex prefix from a Hyperliquid coin identifier to recover
 * the display symbol (`xyz:PURR → PURR`, `BTC → BTC`).
 */
export const perpsDisplaySymbol = (coin: string): string => {
  const idx = coin.indexOf(':')
  return idx >= 0 ? coin.slice(idx + 1) : coin
}
