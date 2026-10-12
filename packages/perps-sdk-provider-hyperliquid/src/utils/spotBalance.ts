import {
  isDecimalString,
  isDecimalStringGreaterThan,
  multiplyDecimalString,
} from '@lifi/perps-sdk'
import type { Asset, Balance, DecimalString, Market } from '@lifi/perps-types'
import { SPOT_MARKET_ID } from '../constants.js'
import type { HlSpotBalance } from '../types/index.js'
import { spotLogoURI } from './assetLogo.js'
import { coinAsset } from './marketDisplay.js'

/**
 * Build USD prices keyed by spot token asset ID. Base tokens use the supplied
 * market mark price; quote tokens default to exactly `$1`; missing or invalid
 * base prices default to `0`.
 * @public
 */
export const spotPriceById = (
  markets: readonly Market[],
  priceByMarketId: ReadonlyMap<string, DecimalString>
): Map<string, DecimalString> => {
  const map = new Map<string, DecimalString>()
  for (const m of markets) {
    if (m.categoryId === SPOT_MARKET_ID) {
      const price = priceByMarketId.get(m.id)
      map.set(m.baseAsset.id, isDecimalString(price) ? price : '0')
    }
  }
  for (const m of markets) {
    if (!map.has(m.quoteAsset.id)) {
      map.set(m.quoteAsset.id, '1')
    }
  }
  return map
}

/**
 * Convert a Hyperliquid spot balance's numeric token index into an SDK asset.
 * The balance payload has no `fullName`, so logo resolution uses the base
 * `_spot` URI rule rather than Unit-underlying lookup.
 * @param registered - The registry `Asset` with the same `id`; only its `decimals` is copied.
 * @public
 */
export const spotAssetFromToken = (
  b: HlSpotBalance,
  registered?: Asset
): Asset => ({
  ...coinAsset(b.coin),
  id: String(b.token),
  logoURI: spotLogoURI(b.coin),
  ...(registered?.decimals === undefined
    ? {}
    : { decimals: registered.decimals }),
})

/** Assemble a typed spot {@link Balance}; `total` is native token units and its unit price and USD value use `priceById`. @public */
export const spotBalance = (
  asset: Asset,
  total: DecimalString,
  priceById: ReadonlyMap<string, DecimalString>
): Balance => {
  const price = priceById.get(asset.id) ?? '0'
  return {
    categoryId: SPOT_MARKET_ID,
    asset,
    units: total,
    valueUsd: multiplyDecimalString(total, price),
    // A zero entry means the map holds no mark for the asset, not a free asset.
    ...(isDecimalStringGreaterThan(price, '0') ? { price } : {}),
  }
}
