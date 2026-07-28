import { stringToFloat } from '@lifi/perps-sdk'
import type { Asset, Balance, Market } from '@lifi/perps-types'
import { SPOT_MARKET_ID } from '../constants.js'
import type { HlSpotBalance } from '../types/index.js'
import { spotLogoURI } from './assetLogo.js'
import { coinAsset } from './marketDisplay.js'

/**
 * Build USD prices keyed by spot token asset ID. Base tokens use the supplied
 * market mark price; quote tokens default to exactly `$1`; missing base prices
 * default to `0`.
 * @public
 */
export const spotPriceById = (
  markets: readonly Market[],
  priceByMarketId: ReadonlyMap<string, number>
): Map<string, number> => {
  const map = new Map<string, number>()
  for (const m of markets) {
    if (m.categoryId === SPOT_MARKET_ID) {
      map.set(m.baseAsset.id, priceByMarketId.get(m.id) ?? 0)
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
 * Convert a Hyperliquid spot balance's numeric token index into an SDK asset.
 * The balance payload has no `fullName`, so logo resolution uses the base
 * `_spot` URI rule rather than Unit-underlying lookup.
 * @public
 */
export const spotAssetFromToken = (b: HlSpotBalance): Asset => ({
  ...coinAsset(b.coin),
  id: String(b.token),
  logoURI: spotLogoURI(b.coin),
})

/** Assemble a typed spot {@link Balance}; `total` is native token units and its USD value uses `priceById`. @public */
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
