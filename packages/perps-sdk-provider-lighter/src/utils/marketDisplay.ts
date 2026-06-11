import type { Asset, MarketDisplay } from '@lifi/perps-types'
import { LIGHTER_PROVIDER_KEY } from '../constants.js'

/** Lighter quotes every market in USDC. */
const QUOTE_SYMBOL = 'USDC'

/**
 * Per-market display metadata resolved from the backend `/perps/markets`
 * registry: the human-readable base symbol and the token logo URL. Empty
 * `logoURI` means the market is unknown to the backend.
 * @public
 */
export type LighterMarketMeta = {
  displaySymbol: string
  logoURI: string
}

/** @public */
export const lighterAsset = (
  id: string,
  displaySymbol: string,
  logoURI = ''
): Asset => ({
  providerId: LIGHTER_PROVIDER_KEY,
  id,
  displaySymbol,
  logoURI,
})

/**
 * Build a {@link MarketDisplay} for a Lighter market. `marketId` is the
 * stringified `market_id`/`market_index`; `displaySymbol` is the
 * human-readable base symbol; `logoURI` is the base token's logo URL (defaults
 * empty when unknown). Quote leg is always USDC.
 * @public
 */
export const marketDisplay = (
  marketId: string,
  displaySymbol: string,
  logoURI = ''
): MarketDisplay => ({
  providerId: LIGHTER_PROVIDER_KEY,
  id: marketId,
  categoryId: LIGHTER_PROVIDER_KEY,
  baseAsset: lighterAsset(marketId, displaySymbol, logoURI),
  quoteAsset: lighterAsset(QUOTE_SYMBOL, QUOTE_SYMBOL),
})
