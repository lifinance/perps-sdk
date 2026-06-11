import type { Asset, Market, MarketDisplay } from '@lifi/perps-types'
import { LIGHTER_PROVIDER_KEY } from '../constants.js'

/** Lighter quotes every market in USDC. */
const QUOTE_SYMBOL = 'USDC'

/** @public */
export const lighterAsset = (id: string, displaySymbol: string): Asset => ({
  providerId: LIGHTER_PROVIDER_KEY,
  id,
  displaySymbol,
  logoURI: '',
})

/**
 * Placeholder {@link MarketDisplay} for a `market_id` the backend registry does
 * not know. Carries only the wire-derived `displaySymbol`; `logoURI` is empty
 * and the quote leg is USDC. Enriched markets come from {@link toMarketDisplay};
 * this is the fallback {@link resolveMarketDisplay} uses on a lookup miss.
 * @public
 */
export const marketDisplay = (
  marketId: string,
  displaySymbol: string
): MarketDisplay => ({
  providerId: LIGHTER_PROVIDER_KEY,
  id: marketId,
  categoryId: LIGHTER_PROVIDER_KEY,
  baseAsset: lighterAsset(marketId, displaySymbol),
  quoteAsset: lighterAsset(QUOTE_SYMBOL, QUOTE_SYMBOL),
})

/**
 * Project a backend {@link Market} to the {@link MarketDisplay} identity carried
 * on mapped fills/positions/orders, preserving the backend's `baseAsset` and
 * `quoteAsset` verbatim (logos, display names) rather than re-deriving them.
 * @public
 */
export const toMarketDisplay = (m: Market): MarketDisplay => ({
  providerId: m.providerId,
  id: m.id,
  categoryId: m.categoryId,
  baseAsset: m.baseAsset,
  quoteAsset: m.quoteAsset,
})

/**
 * Resolve a wire `market_id` to its backend-enriched {@link MarketDisplay},
 * falling back to a {@link marketDisplay} placeholder built from
 * `fallbackSymbol` when the registry does not know the id. `(providerId,
 * market_id)` uniquely identifies a Lighter market and `providerId` is constant
 * here, so `market_id` alone keys the lookup.
 * @param fallbackSymbol - Display symbol for the placeholder; defaults to `market_<id>`.
 * @public
 */
export const resolveMarketDisplay = (
  byMarketId: ReadonlyMap<number, MarketDisplay>,
  marketId: number,
  fallbackSymbol = `market_${marketId}`
): MarketDisplay =>
  byMarketId.get(marketId) ?? marketDisplay(String(marketId), fallbackSymbol)
