import type { MarketPrice } from '@lifi/perps-types'
import type { HlAssetCtx } from '../types/index.js'

const NEXT_FUNDING_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Map a Hyperliquid asset context plus its mid to a {@link MarketPrice} — the
 * live mark/stats data for the `/prices` item. `mid` is the market mid from
 * `allMids`, known to the caller; `HlAssetCtx` carries no mid of its own.
 * @public
 */
export const mapMarketPrice = (
  marketId: string,
  assetCtx: HlAssetCtx,
  mid: string
): MarketPrice => {
  const now = Date.now()
  const nextFundingTime =
    Math.ceil(now / NEXT_FUNDING_INTERVAL_MS) * NEXT_FUNDING_INTERVAL_MS

  return {
    marketId,
    price: mid,
    markPrice: assetCtx.markPx,
    prevDayPrice: assetCtx.prevDayPx,
    volume24h: assetCtx.dayNtlVlm,
    openInterest: assetCtx.openInterest,
    funding: {
      rate: assetCtx.funding,
      nextFundingTime,
    },
  }
}
