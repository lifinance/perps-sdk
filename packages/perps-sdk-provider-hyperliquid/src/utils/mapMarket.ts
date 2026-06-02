import type { PerpsMarket } from '@lifi/perps-types'
import type { HlAssetCtx, HlUniverseItem } from '../types/index.js'
import { deriveMarket, marketDisplayFromCoin } from './deriveMarket.js'

const NEXT_FUNDING_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

/** @public */
export const mapMarket = (
  universe: HlUniverseItem,
  assetCtx: HlAssetCtx
): PerpsMarket => {
  const now = Date.now()
  const nextFundingTime =
    Math.ceil(now / NEXT_FUNDING_INTERVAL_MS) * NEXT_FUNDING_INTERVAL_MS

  const display = marketDisplayFromCoin(universe.name)

  return {
    providerId: display.providerId,
    id: display.id,
    categoryId: deriveMarket(universe.name),
    baseAsset: display.baseAsset,
    quoteAsset: display.quoteAsset,
    szDecimals: universe.szDecimals,
    markPrice: assetCtx.markPx,
    volume24h: assetCtx.dayNtlVlm,
    prevDayPrice: assetCtx.prevDayPx,
    maxLeverage: universe.maxLeverage,
    onlyIsolated: universe.onlyIsolated === true,
    funding: {
      rate: assetCtx.funding,
      nextFundingTime,
    },
    openInterest: assetCtx.openInterest,
  }
}
