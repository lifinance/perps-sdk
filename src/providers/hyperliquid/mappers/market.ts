import type { Market } from '../../../market.js'
import { calculateAssetId } from '../assetId.js'
import type { HlAssetCtx, HlUniverseItem } from '../types.js'

const NEXT_FUNDING_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

export const mapMarket = (
  universe: HlUniverseItem,
  assetCtx: HlAssetCtx,
  providerIndex: number,
  indexInProvider: number,
  providerKey: string
): Market => {
  const now = Date.now()
  const nextFundingTime =
    Math.ceil(now / NEXT_FUNDING_INTERVAL_MS) * NEXT_FUNDING_INTERVAL_MS

  return {
    symbol: universe.name,
    name: universe.name,
    logoURI: `https://app.hyperliquid.xyz/coins/${universe.name}.svg`,
    assetId: calculateAssetId(providerIndex, indexInProvider),
    provider: providerKey,
    szDecimals: universe.szDecimals,
    maxLeverage: universe.maxLeverage,
    onlyIsolated: universe.onlyIsolated === true,
    funding: {
      rate: assetCtx.funding,
      nextFundingTime,
    },
    openInterest: assetCtx.openInterest,
    volume24h: assetCtx.dayNtlVlm,
    markPrice: assetCtx.markPx,
  }
}
