/**
 * Ondo order size and price formatting for exchange submission.
 *
 * The LI.FI backend derives a flat per-market decimal budget from Ondo's
 * contract increments (`quoteIncrement` / `baseIncrement`), surfaced on the
 * generic {@link Market} as `priceDecimals` / `szDecimals`. Prices round to
 * the tick grid; sizes truncate to the lot grid.
 */

import { PerpsError } from '@lifi/perps-sdk'
import { type Market, PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'

/**
 * Format a price onto an Ondo market's tick grid: rounded to the market's
 * `priceDecimals`, trailing zeros stripped.
 *
 * @throws {PerpsError} `ValidationError` when `market.priceDecimals` is
 *   absent — without the venue's tick grid no correct price can be produced.
 * @public
 */
export function formatOrderPrice(market: Market, price: number): string {
  if (market.priceDecimals === undefined) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Market '${market.id}' carries no priceDecimals; Ondo order prices ` +
        `cannot be formatted without the market's tick grid.`
    )
  }
  const rounded = new Big(price).round(market.priceDecimals, Big.roundHalfUp)
  return rounded.eq(0) ? '0' : rounded.toFixed()
}

/**
 * Format a size onto an Ondo market's lot grid: truncated (never rounded
 * up, so the size cannot exceed the user's balance) to the market's
 * `szDecimals`, trailing zeros stripped.
 *
 * @param size - Size in base-asset units as a non-negative magnitude.
 * @public
 */
export function formatOrderSize(market: Market, size: number): string {
  const truncated = new Big(size).round(market.szDecimals, Big.roundDown)
  return truncated.eq(0) ? '0' : truncated.toFixed()
}
