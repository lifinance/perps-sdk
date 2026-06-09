/**
 * Hyperliquid order size and price formatting for exchange submission.
 *
 * These encode Hyperliquid-specific order submission rules. Getting size/price
 * formatting wrong causes rejected orders.
 *
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size
 */

import { stringToFloat } from '@lifi/perps-sdk'
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
 * Format a size value for order submission.
 *
 * Per Hyperliquid docs (tick-and-lot-size):
 * - Size must be rounded to the asset's szDecimals
 * - Trailing zeroes must be removed for signing
 *
 * @param size - The size value to format
 * @param szDecimals - Number of decimal places allowed for this asset (from meta)
 * @returns Size as a string with correct precision, no trailing zeros
 * @public
 */
export function formatOrderSize(size: number, szDecimals: number): string {
  // Big.roundDown truncates toward zero — never round a size up, it could
  // exceed available balance. Exact decimal arithmetic: flooring the float
  // product dropped a lot step (0.29 * 100 === 28.999999999999996).
  const truncated = new Big(size).round(szDecimals, Big.roundDown)
  // toFixed() with no dp always emits plain notation; eq(0) guards '-0'
  return truncated.eq(0) ? '0' : truncated.toFixed()
}

/**
 * Format a price value for order submission.
 *
 * Per Hyperliquid docs (tick-and-lot-size):
 * - Maximum 5 significant figures
 * - Max decimals = MAX_DECIMALS - szDecimals (6 for perps, 8 for spot)
 * - Integer prices always allowed regardless of significant figures
 * - Trailing zeroes must be removed for signing
 *
 * @param price - The price value to format
 * @param szDecimals - The asset's szDecimals (affects max price decimals)
 * @param market - Optional market type (e.g. 'spot'). Defaults to perps rules.
 * @returns Price as a string with correct precision, no trailing zeros
 * @public
 */
export function formatOrderPrice(
  price: number,
  szDecimals: number,
  market?: string
): string {
  const maxPriceDecimals = getMaxPriceDecimals(szDecimals, market)

  let rounded = stringToFloat(price.toFixed(maxPriceDecimals))

  if (Number.isInteger(rounded)) {
    return rounded.toString()
  }

  const absStr = Math.abs(rounded).toString().replace('.', '')
  const sigFigs = absStr.replace(/^0+/, '').length

  if (sigFigs > 5) {
    rounded = stringToFloat(rounded.toPrecision(5))
  }

  return rounded.toString()
}
