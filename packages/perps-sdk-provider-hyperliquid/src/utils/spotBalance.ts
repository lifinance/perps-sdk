import { stringToFloat } from '@lifi/perps-sdk'
import type { Asset, Balance, Market } from '@lifi/perps-types'
import { SPOT_MARKET_ID } from '../constants.js'
import { marketDisplayFromCoin } from './deriveMarket.js'

/** Hyperliquid quotes every spot pair in USDC; the quote leg prices at $1. */
const QUOTE_SYMBOL = 'USDC'

/** The Hyperliquid spot-balance fields needed to resolve an {@link Asset}. */
export interface HlSpotBalanceRef {
  coin: string
  token: number
}

/**
 * Resolve the held {@link Asset} for a Hyperliquid spot balance from its
 * venue `coin`/`token`, synthesising the display from the coin and stamping
 * the provider-minted `token` id. Reference mapper shared by REST `getAccount`
 * and the WS `spotClearinghouseState` handler.
 * @public
 */
export const spotAsset = (b: HlSpotBalanceRef): Asset => ({
  ...marketDisplayFromCoin(b.coin).baseAsset,
  id: String(b.token),
})

/**
 * USD mark price per spot base-token identity (`SpotMarket.baseAsset.id`, the
 * venue `coin`), drawn from the enriched market list. Keyed by base-token
 * identity rather than the pair display string so a balance can look its price
 * up by `coin`, and scoped to spot markets so a base token sharing a symbol
 * with a perp cannot inherit the perp's mark. The USDC quote leg prices at $1.
 * @public
 */
export const spotPriceByCoin = (markets: Market[]): Map<string, number> => {
  const map = new Map<string, number>()
  for (const m of markets) {
    if (m.categoryId === SPOT_MARKET_ID) {
      map.set(m.baseAsset.id, stringToFloat(m.markPrice))
    }
  }
  map.set(QUOTE_SYMBOL, 1)
  return map
}

/**
 * Map a Hyperliquid spot balance to a typed {@link Balance} carrying the
 * resolved {@link Asset} and its USD value (`units * spot mark price`).
 * @public
 */
export const spotBalance = (
  b: HlSpotBalanceRef & { total: string },
  priceByCoin: Map<string, number>
): Balance => {
  const price = priceByCoin.get(b.coin) ?? 0
  return {
    categoryId: SPOT_MARKET_ID,
    asset: spotAsset(b),
    units: b.total,
    valueUsd: (stringToFloat(b.total) * price).toString(),
  }
}
