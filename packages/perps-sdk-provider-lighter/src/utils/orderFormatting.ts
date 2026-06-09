/**
 * Lighter order size and price formatting for exchange submission.
 *
 * Lighter publishes a flat per-market decimal budget on its order books
 * (`supported_price_decimals` / `supported_size_decimals`), surfaced on the
 * generic {@link Market} as `priceDecimals` / `szDecimals`. Prices round to
 * the tick grid; sizes truncate to the lot grid.
 */

import { PerpsError, stringToFloat } from '@lifi/perps-sdk'
import { type Market, PerpsErrorCode } from '@lifi/perps-types'

/**
 * Truncate toward zero to `decimals` places, trailing zeros stripped.
 * Operates on the value's decimal string so binary float artifacts cannot
 * shave a lot off the last kept digit (e.g. `8.2` stays `8.2`, not `8.19`).
 */
function truncateToDecimals(value: number, decimals: number): string {
  const repr = value.toString()
  const fixed = repr.includes('e') ? value.toFixed(Math.max(decimals, 0)) : repr
  const [whole, fraction = ''] = fixed.split('.')
  const kept =
    decimals > 0 ? fraction.slice(0, decimals).replace(/0+$/, '') : ''
  return kept === '' ? whole : `${whole}.${kept}`
}

/**
 * Format a price onto a Lighter market's tick grid: rounded to the market's
 * `priceDecimals` (Lighter's `supported_price_decimals`), trailing zeros
 * stripped.
 *
 * @throws {PerpsError} `ValidationError` when `market.priceDecimals` is
 *   absent — without the venue's tick grid no correct price can be produced.
 * @public
 */
export function formatOrderPrice(market: Market, price: number): string {
  if (market.priceDecimals === undefined) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Market '${market.id}' carries no priceDecimals; Lighter order prices ` +
        `cannot be formatted without the market's tick grid.`
    )
  }
  return stringToFloat(price.toFixed(market.priceDecimals)).toString()
}

/**
 * Format a size onto a Lighter market's lot grid: truncated (never rounded
 * up, so the size cannot exceed the user's balance) to the market's
 * `szDecimals` (Lighter's `supported_size_decimals`), trailing zeros stripped.
 *
 * @param size - Size in base-asset units as a non-negative magnitude.
 * @public
 */
export function formatOrderSize(market: Market, size: number): string {
  return truncateToDecimals(size, market.szDecimals)
}
