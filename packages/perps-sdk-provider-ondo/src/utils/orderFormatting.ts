/**
 * Ondo order size and price snapping for exchange submission.
 *
 * Ondo's tick and lot grids are exact contract increments (`quoteIncrement` /
 * `baseIncrement`) that need not be powers of ten. When the generic
 * {@link Market} carries the raw increment (`priceIncrement` / `sizeIncrement`)
 * these helpers snap onto that grid; otherwise they fall back to the
 * power-of-ten grid implied by `priceDecimals` / `szDecimals`. Prices round
 * half-up to the nearest tick; sizes truncate toward zero to the lot.
 */

import { PerpsError } from '@lifi/perps-sdk'
import {
  type DecimalString,
  type Market,
  PerpsErrorCode,
} from '@lifi/perps-types'
import Big from 'big.js'

// At DP 0, `div` rounds the exact quotient once, straight to a whole step count.
const TickBig = Big()
TickBig.DP = 0
TickBig.RM = Big.roundHalfUp

const LotBig = Big()
LotBig.DP = 0
LotBig.RM = Big.roundDown

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
      `be snapped without the market's tick increment.`
  )
}

/**
 * Snap a price onto an Ondo market's tick grid: half-up to the nearest
 * `priceIncrement` (or the grid implied by `priceDecimals`), trailing zeros
 * stripped.
 *
 * @throws {PerpsError} `ValidationError` when the market carries neither
 *   `priceIncrement` nor `priceDecimals` — without the venue's tick grid no
 *   correct price can be produced.
 * @public
 */
export function snapOrderPrice(
  market: Market,
  price: DecimalString
): DecimalString {
  const increment = priceGrid(market)
  const snapped = new TickBig(price).div(increment).times(increment)
  return snapped.eq(0) ? '0' : snapped.toFixed()
}

/**
 * Snap a size onto an Ondo market's lot grid: truncated toward zero (never
 * rounded up, so the size cannot exceed the user's balance) to the market's
 * `sizeIncrement` (or the grid implied by `szDecimals`), trailing zeros
 * stripped.
 *
 * @param size - Size in base-asset units as a non-negative magnitude.
 * @public
 */
export function snapOrderSize(
  market: Market,
  size: DecimalString
): DecimalString {
  const increment =
    market.sizeIncrement !== undefined
      ? new Big(market.sizeIncrement)
      : powerOfTenIncrement(market.szDecimals)
  const snapped = new LotBig(size).div(increment).times(increment)
  return snapped.eq(0) ? '0' : snapped.toFixed()
}
