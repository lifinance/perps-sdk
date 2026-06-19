import type { MarketContext } from '@lifi/perps-types'
import type { HlWsPerpAssetCtx } from '../types/index.js'

const NEXT_FUNDING_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Map a Hyperliquid perp asset context from the `allDexsAssetCtxs` feed to a
 * {@link MarketContext}. `midPx` is null when the book is empty; mid then falls
 * back to the mark so the context always carries a usable mid.
 * @public
 */
export const mapMarketContext = (
  marketId: string,
  ctx: HlWsPerpAssetCtx
): MarketContext => {
  const now = Date.now()
  const nextFundingTime =
    Math.ceil(now / NEXT_FUNDING_INTERVAL_MS) * NEXT_FUNDING_INTERVAL_MS

  return {
    marketId,
    midPrice: ctx.midPx ?? ctx.markPx,
    markPrice: ctx.markPx,
    oraclePrice: ctx.oraclePx,
    prevDayPrice: ctx.prevDayPx,
    volume24h: ctx.dayNtlVlm,
    openInterest: ctx.openInterest,
    funding: {
      rate: ctx.funding,
      nextFundingTime,
    },
  }
}
