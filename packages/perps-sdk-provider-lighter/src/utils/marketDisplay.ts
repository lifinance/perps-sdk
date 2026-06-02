import type { Asset, MarketDisplay } from '@lifi/perps-types'
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
 * Build a {@link MarketDisplay} for a Lighter market. `marketId` is the
 * stringified `market_id`/`market_index`; `displaySymbol` is the
 * human-readable base symbol. Quote leg is always USDC.
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
