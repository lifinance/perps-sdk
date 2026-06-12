import type { PerpsMarket } from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'
import type { HlAssetCtx, HlUniverseItem } from '../types/index.js'
import { calculateMaintenanceMarginRate } from './liquidation.js'
import { coinAsset } from './marketDisplay.js'
import { getMaxPriceDecimals } from './orderFormatting.js'

const NEXT_FUNDING_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

/** Hyperliquid quotes every perp market in USDC. */
const QUOTE_SYMBOL = 'USDC'

/**
 * Map a Hyperliquid universe entry + asset context to a {@link PerpsMarket}.
 * `categoryId` is the `Provider.categories[].id` of the dex the entry was
 * fetched from — known to the caller at fetch time, never re-derived from
 * the coin string.
 * @public
 */
export const mapMarket = (
  universe: HlUniverseItem,
  assetCtx: HlAssetCtx,
  categoryId: string
): PerpsMarket => {
  const now = Date.now()
  const nextFundingTime =
    Math.ceil(now / NEXT_FUNDING_INTERVAL_MS) * NEXT_FUNDING_INTERVAL_MS

  return {
    providerId: PROVIDER_KEY,
    id: universe.name,
    categoryId,
    baseAsset: coinAsset(universe.name),
    quoteAsset: coinAsset(QUOTE_SYMBOL),
    szDecimals: universe.szDecimals,
    priceDecimals: getMaxPriceDecimals(universe.szDecimals),
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
    maintenanceMarginRate: calculateMaintenanceMarginRate(universe.maxLeverage),
  }
}
