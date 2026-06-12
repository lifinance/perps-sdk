import { stringToFloat } from '@lifi/perps-sdk'
import type { Asset, Balance, Market } from '@lifi/perps-types'
import { SPOT_MARKET_ID } from '../constants.js'
import type { HlSpotBalance } from '../types/index.js'
import { coinAsset } from './marketDisplay.js'

/**
 * USD mark price keyed by spot token index: each spot market's `markPrice`
 * under its base-asset id, and every market's quote-asset id at $1.
 */
export const spotPriceById = (
  markets: readonly Market[]
): Map<string, number> => {
  const map = new Map<string, number>()
  for (const m of markets) {
    if (m.categoryId === SPOT_MARKET_ID) {
      map.set(m.baseAsset.id, stringToFloat(m.markPrice))
    }
  }
  for (const m of markets) {
    if (!map.has(m.quoteAsset.id)) {
      map.set(m.quoteAsset.id, 1)
    }
  }
  return map
}

/**
 * The held spot {@link Asset} for an HL balance: the venue token index
 * (`b.token`) as `Asset.id` — equal to that token's spot `Market.baseAsset.id`
 * — with display fields derived from the coin.
 */
export const spotAssetFromToken = (b: HlSpotBalance): Asset => ({
  ...coinAsset(b.coin),
  id: String(b.token),
})

/** Assemble a typed spot {@link Balance} from its resolved asset and raw size. */
export const spotBalance = (
  asset: Asset,
  total: string,
  priceById: Map<string, number>
): Balance => ({
  categoryId: SPOT_MARKET_ID,
  asset,
  units: total,
  valueUsd: (stringToFloat(total) * (priceById.get(asset.id) ?? 0)).toString(),
})
