import type { PerpsMarket } from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'
import type { HlUniverseItem } from '../types/index.js'
import { calculateMaintenanceMarginRate } from './liquidation.js'
import { coinAsset } from './marketDisplay.js'
import { getMaxPriceDecimals } from './orderFormatting.js'

/** Hyperliquid quotes every perp market in USDC. */
const QUOTE_SYMBOL = 'USDC'

/**
 * Map a Hyperliquid universe entry to a {@link PerpsMarket}'s static instrument
 * metadata. Live mark/stats fields live on the {@link MarketContext} — see
 * {@link mapMarketContext}. `categoryId` is the `Provider.categories[].id` of the
 * dex the entry was fetched from — known to the caller at fetch time, never
 * re-derived from the coin string.
 * @public
 */
export const mapMarket = (
  universe: HlUniverseItem,
  categoryId: string
): PerpsMarket => ({
  providerId: PROVIDER_KEY,
  id: universe.name,
  ...(universe.isDelisted === undefined
    ? {}
    : { isDelisted: universe.isDelisted }),
  categoryId,
  baseAsset: coinAsset(universe.name),
  quoteAsset: coinAsset(QUOTE_SYMBOL),
  szDecimals: universe.szDecimals,
  priceDecimals: getMaxPriceDecimals(universe.szDecimals),
  maxLeverage: universe.maxLeverage,
  onlyIsolated: universe.onlyIsolated === true,
  maintenanceMarginRate: calculateMaintenanceMarginRate(universe.maxLeverage),
})
