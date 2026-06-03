import type { Market, MarketDisplay } from '@lifi/perps-types'

/**
 * Project a {@link Market} onto the embedded {@link MarketDisplay} subset.
 * @public
 */
export const marketToDisplay = (m: Market): MarketDisplay => ({
  providerId: m.providerId,
  id: m.id,
  categoryId: m.categoryId,
  baseAsset: m.baseAsset,
  quoteAsset: m.quoteAsset,
})

/**
 * Re-key an entity mapped from the venue (`market: MarketDisplay` synthesised
 * by `marketDisplayFromCoin`) onto the backend's enriched market list. Leaves
 * the mapper's own display when the venue references a market the backend does
 * not list.
 * @public
 */
export const resolveEntityMarket = <T extends { market: MarketDisplay }>(
  entity: T,
  byMarketId: Map<string, Market>
): T => {
  const market = byMarketId.get(entity.market.id)
  return market === undefined
    ? entity
    : { ...entity, market: marketToDisplay(market) }
}
