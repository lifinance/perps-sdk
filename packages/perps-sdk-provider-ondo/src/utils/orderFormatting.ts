/**
 * Ondo order size and price formatting for exchange submission.
 *
 * Ondo's tick and lot grids are exact contract increments (`quoteIncrement` /
 * `baseIncrement`) that need not be powers of ten. When the generic
 * {@link Market} carries the raw increment (`priceIncrement` / `sizeIncrement`)
 * these helpers snap onto that grid; otherwise they fall back to the
 * power-of-ten grid implied by `priceDecimals` / `szDecimals`. Prices round
 * half-up to the nearest tick; sizes truncate toward zero to the lot.
 */

import { PerpsError } from '@lifi/perps-sdk'
import { type Market, PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'

const powerOfTenIncrement = (decimals: number): Big => new Big(`1e-${decimals}`)

const priceGrid = (market: Market): Big => {
  if (market.priceIncrement !== undefined) {
    return new Big(market.priceIncrement)
  }
  if (market.priceDecimals !== undefined) {
    return powerOfTenIncrement(market.priceDecimals)
  }
  throw new PerpsError(
    PerpsErrorCode.ValidationError,
    `Market '${market.id}' carries no price grid; Ondo order prices cannot ` +
      `be formatted without the market's tick increment.`
  )
}

/**
 * Format a price onto an Ondo market's tick grid: snapped half-up to the
 * nearest `priceIncrement` (or the grid implied by `priceDecimals`), trailing
 * zeros stripped.
 *
 * @throws {PerpsError} `ValidationError` when the market carries neither
 *   `priceIncrement` nor `priceDecimals` — without the venue's tick grid no
 *   correct price can be produced.
 * @public
 */
export function formatOrderPrice(market: Market, price: number): string {
  const increment = priceGrid(market)
  const snapped = new Big(price)
    .div(increment)
    .round(0, Big.roundHalfUp)
    .times(increment)
  return snapped.eq(0) ? '0' : snapped.toFixed()
}

/**
 * Format a size onto an Ondo market's lot grid: truncated toward zero (never
 * rounded up, so the size cannot exceed the user's balance) to the market's
 * `sizeIncrement` (or the grid implied by `szDecimals`), trailing zeros
 * stripped.
 *
 * @param size - Size in base-asset units as a non-negative magnitude.
 * @public
 */
export function formatOrderSize(market: Market, size: number): string {
  const increment =
    market.sizeIncrement !== undefined
      ? new Big(market.sizeIncrement)
      : powerOfTenIncrement(market.szDecimals)
  const snapped = new Big(size)
    .div(increment)
    .round(0, Big.roundDown)
    .times(increment)
  return snapped.eq(0) ? '0' : snapped.toFixed()
}
