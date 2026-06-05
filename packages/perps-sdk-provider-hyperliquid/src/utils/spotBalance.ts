import { stringToFloat } from '@lifi/perps-sdk'
import type { Asset, Balance, Market } from '@lifi/perps-types'
import { SPOT_MARKET_ID } from '../constants.js'
import { marketDisplayFromCoin } from './deriveMarket.js'

/** Held spot Asset. `id` is the coin symbol (= SpotMarket.baseAsset.id), NOT the token index. */
export const spotAsset = (b: { coin: string }): Asset =>
  marketDisplayFromCoin(b.coin).baseAsset

/**
 * USD mark price keyed by spot base-token identity (`SpotMarket.baseAsset.id` =
 * coin symbol = the held `Asset.id`). Quote/stable legs price at $1, derived
 * from the markets' actual quote-asset symbols — never a hardcoded 'USDC'.
 */
export const spotPriceByAssetId = (
  markets: Market[],
  quoteSymbols: ReadonlySet<string>
): Map<string, number> => {
  const map = new Map<string, number>()
  for (const m of markets) {
    if (m.categoryId === SPOT_MARKET_ID) {
      map.set(m.baseAsset.id, stringToFloat(m.markPrice))
    }
  }
  for (const s of quoteSymbols) {
    if (!map.has(s)) {
      map.set(s, 1)
    }
  }
  return map
}

/** Map an HL spot balance to a typed Balance (asset.id = coin symbol). */
export const spotBalance = (
  b: { coin: string; total: string },
  priceByAssetId: Map<string, number>
): Balance => {
  const asset = spotAsset(b)
  const price = priceByAssetId.get(asset.id) ?? 0
  return {
    categoryId: SPOT_MARKET_ID,
    asset,
    units: b.total,
    valueUsd: (stringToFloat(b.total) * price).toString(),
  }
}
