import type { Asset } from '@lifi/perps-types'
import type { HlAssetCtx, HlUniverseItem } from '../types/index.js'
import { deriveMarket } from './_market.js'

const NEXT_FUNDING_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

export const mapAsset = (
  universe: HlUniverseItem,
  assetCtx: HlAssetCtx
): Asset => {
  const now = Date.now()
  const nextFundingTime =
    Math.ceil(now / NEXT_FUNDING_INTERVAL_MS) * NEXT_FUNDING_INTERVAL_MS

  return {
    assetId: universe.name,
    market: deriveMarket(universe.name),
    displaySymbol: universe.name,
    displayQuote: null,
    logoURI: `https://app.hyperliquid.xyz/coins/${universe.name}.svg`,
    szDecimals: universe.szDecimals,
    maxLeverage: universe.maxLeverage,
    onlyIsolated: universe.onlyIsolated === true,
    funding: {
      rate: assetCtx.funding,
      nextFundingTime,
    },
    openInterest: assetCtx.openInterest,
    volume24h: assetCtx.dayNtlVlm,
    prevDayPrice: assetCtx.prevDayPx,
    markPrice: assetCtx.markPx,
  }
}
