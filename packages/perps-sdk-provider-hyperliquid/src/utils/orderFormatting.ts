/**
 * Hyperliquid order size and price snapping for exchange submission.
 *
 * These encode Hyperliquid-specific order submission rules. Snapping a size or
 * a price onto the wrong grid causes rejected orders.
 *
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size
 */

import type { DecimalString } from '@lifi/perps-types'
import Big from 'big.js'

/**
 * Max combined decimals (size + price) enforced by Hyperliquid.
 * Perps: 6, Spot: 8
 */
const MAX_DECIMALS_PERPS = 6
const MAX_DECIMALS_SPOT = 8

function getMaxDecimals(market?: string): number {
  return market === 'spot' ? MAX_DECIMALS_SPOT : MAX_DECIMALS_PERPS
}

/**
 * Derive the maximum number of price decimal places for a given asset.
 *
 * @param szDecimals - The asset's szDecimals (from market meta)
 * @param market - Optional market type (e.g. 'spot'). Defaults to perps rules.
 * @returns Maximum allowed price decimals
 * @public
 */
export function getMaxPriceDecimals(
  szDecimals: number,
  market?: string
): number {
  return Math.max(0, getMaxDecimals(market) - szDecimals)
}

/**
 * Snap a size onto the asset's lot grid for order submission.
 *
 * Per Hyperliquid docs (tick-and-lot-size):
 * - Size must be rounded to the asset's szDecimals
 * - Trailing zeroes must be removed for signing
 *
 * @param size - The size to snap, as a decimal string
 * @param szDecimals - Number of decimal places allowed for this asset (from meta)
 * @returns Size as a decimal string with correct precision, no trailing zeros
 * @public
 */
export function snapOrderSize(
  size: DecimalString,
  szDecimals: number
): DecimalString {
  // Big.roundDown truncates toward zero — never round a size up, it could
  // exceed available balance.
  const truncated = new Big(size).round(szDecimals, Big.roundDown)
  // toFixed() with no dp always emits plain notation; eq(0) guards '-0'
  return truncated.eq(0) ? '0' : truncated.toFixed()
}

/**
 * Snap a price onto the asset's tick grid for order submission.
 *
 * Per Hyperliquid docs (tick-and-lot-size):
 * - Maximum 5 significant figures
 * - Max decimals = MAX_DECIMALS - szDecimals (6 for perps, 8 for spot)
 * - Integer prices always allowed regardless of significant figures
 * - Trailing zeroes must be removed for signing
 *
 * Rounding is half-up (away from zero at exact halfway) on the true decimal
 * value, which is why the price arrives as a string: `(1.005).toFixed(2)`
 * would give `'1.00'`.
 *
 * @param price - The price to snap, as a decimal string
 * @param szDecimals - The asset's szDecimals (affects max price decimals)
 * @param market - Optional market type (e.g. 'spot'). Defaults to perps rules.
 * @returns Price as a decimal string with correct precision, no trailing zeros
 * @public
 */
export function snapOrderPrice(
  price: DecimalString,
  szDecimals: number,
  market?: string
): DecimalString {
  const value = new Big(price)
  // Big's `e` is the base-10 exponent of the leading digit. Integer prices
  // bypass the 5 sig-fig rule, so the sig-fig grid never goes coarser than 1.
  const sigFigDecimals = Math.max(0, 4 - value.e)
  const decimals = Math.min(
    sigFigDecimals,
    getMaxPriceDecimals(szDecimals, market)
  )
  const rounded = value.round(decimals, Big.roundHalfUp)

  // toFixed() with no dp always emits plain notation; eq(0) guards '-0'
  return rounded.eq(0) ? '0' : rounded.toFixed()
}
