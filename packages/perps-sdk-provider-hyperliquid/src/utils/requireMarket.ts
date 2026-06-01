import { PerpsError } from '@lifi/perps-sdk'
import {
  type Market,
  type MarketDisplay,
  PerpsErrorCode,
} from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'

const toDisplay = (m: Market): MarketDisplay => ({
  providerId: m.providerId,
  id: m.id,
  categoryId: m.categoryId,
  baseAsset: m.baseAsset,
  quoteAsset: m.quoteAsset,
})

/**
 * Resolve a wire market id against the backend's enriched market list. The
 * list is the source of truth for every tradable market, so an id the venue
 * references but the backend does not know is a hard error — never a silent
 * fallback to an unenriched stand-in.
 */
export const requireMarket = (
  byMarketId: Map<string, Market>,
  marketId: string
): MarketDisplay => {
  const market = byMarketId.get(marketId)
  if (!market) {
    const err = new PerpsError(
      PerpsErrorCode.MarketNotFound,
      `No Hyperliquid market found for marketId '${marketId}'`
    )
    err.tool = PROVIDER_KEY
    throw err
  }
  return toDisplay(market)
}
