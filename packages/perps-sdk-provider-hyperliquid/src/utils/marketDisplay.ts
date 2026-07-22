import type { Asset, Market } from '@lifi/perps-types'
import {
  MAIN_DEX_NAME,
  MAIN_MARKET_ID,
  PROVIDER_KEY,
  SPOT_MARKET_ID,
} from '../constants.js'
import { applyLogoOverride } from './assetLogo.js'

/**
 * Synthesise the {@link Asset} for a Hyperliquid wire coin. `id` keeps the raw
 * coin — the logo CDN is keyed by it, HIP-3 `dex:` prefix included.
 * `displaySymbol` drops the prefix: the category is carried by `categoryId`,
 * never by the display string. `logoURI` is the CDN URL corrected by the
 * shared override table (see {@link applyLogoOverride}).
 * @public
 */
export const coinAsset = (coin: string): Asset =>
  applyLogoOverride({
    providerId: PROVIDER_KEY,
    id: coin,
    displaySymbol: coin.includes(':')
      ? coin.slice(coin.indexOf(':') + 1)
      : coin,
    logoURI: `https://app.hyperliquid.xyz/coins/${coin}.svg`,
  })

/**
 * Distinct wire `dex` names to fan `clearinghouseState` / `frontendOpenOrders`
 * reads across, derived from the backend market list. Spot is excluded (it has
 * no clearinghouseState); the main perp dex maps to the empty string.
 * @public
 */
export const perpsDexNames = (markets: readonly Market[]): string[] => {
  const names = new Set<string>()
  for (const m of markets) {
    if (m.categoryId === SPOT_MARKET_ID) {
      continue
    }
    names.add(m.categoryId === MAIN_MARKET_ID ? MAIN_DEX_NAME : m.categoryId)
  }
  return [...names]
}
