import type { MarketContext } from '@lifi/perps-types'
import Big from 'big.js'
import type { HlWsFastAssetCtx, HlWsPerpAssetCtx } from '../types/index.js'

const NEXT_FUNDING_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Convert venue base-unit open interest to a quote-asset notional. A mark that
 * is not a positive number leaves the notional unknown rather than zero.
 */
const toOpenInterestNotional = (
  openInterest: string,
  markPrice: string
): string | undefined => {
  try {
    const mark = new Big(markPrice)
    if (mark.lte(0)) {
      return undefined
    }
    return new Big(openInterest).times(mark).toFixed()
  } catch {
    return undefined
  }
}

/**
 * Map a Hyperliquid perp asset context from the `allDexsAssetCtxs` feed to a
 * {@link MarketContext}, with mid and mark overlaid from a `fastAssetCtxs`
 * context where one is given. `midPx` is null when the book is empty; mid then
 * falls back to the mark so the context always carries a usable mid. The
 * open-interest notional follows the emitted mark, so it never mixes the two
 * feeds' prices.
 * @public
 */
export const mapMarketContext = (
  marketId: string,
  ctx: HlWsPerpAssetCtx,
  fast?: HlWsFastAssetCtx
): MarketContext => {
  const now = Date.now()
  const nextFundingTime =
    Math.ceil(now / NEXT_FUNDING_INTERVAL_MS) * NEXT_FUNDING_INTERVAL_MS
  const markPrice = fast?.markPx != null ? fast.markPx : ctx.markPx

  return {
    marketId,
    midPrice: fast?.midPx != null ? fast.midPx : (ctx.midPx ?? ctx.markPx),
    markPrice,
    oraclePrice: ctx.oraclePx,
    prevDayPrice: ctx.prevDayPx,
    volume24h: ctx.dayNtlVlm,
    openInterest: toOpenInterestNotional(ctx.openInterest, markPrice),
    funding: {
      rate: ctx.funding,
      nextFundingTime,
    },
  }
}
