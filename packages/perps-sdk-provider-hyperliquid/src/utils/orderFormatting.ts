/**
 * Hyperliquid order size and price formatting for exchange submission.
 *
 * These encode Hyperliquid-specific order submission rules. Getting size/price
 * formatting wrong causes rejected orders.
 *
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size
 */

import { stringToFloat } from '@lifi/perps-sdk'

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
  // Truncate toward zero (never round up — could exceed available balance) on
  // the decimal string: flooring the float product drops a lot step (0.29 * 100 === 28.999999999999996)
  const [whole = '', fraction = ''] = toPlainDecimalString(size).split('.')
  const truncatedFraction = fraction.slice(0, szDecimals)
  const truncated = truncatedFraction ? `${whole}.${truncatedFraction}` : whole
  // Remove trailing zeros by round-tripping through stringToFloat
  return stringToFloat(truncated).toString()
}

// Number#toString switches to exponential notation for |x| < 1e-6 and >= 1e21
function toPlainDecimalString(value: number): string {
  const str = value.toString()
  const eIndex = str.indexOf('e')
  if (eIndex === -1) {
    return str
  }
  const exponent = Number(str.slice(eIndex + 1))
  const [sign, mantissa] = str.startsWith('-')
    ? ['-', str.slice(1, eIndex)]
    : ['', str.slice(0, eIndex)]
  const digits = mantissa.replace('.', '')
  const pointIndex = mantissa.split('.')[0].length + exponent
  if (pointIndex <= 0) {
    return `${sign}0.${'0'.repeat(-pointIndex)}${digits}`
  }
  if (pointIndex >= digits.length) {
    return `${sign}${digits}${'0'.repeat(pointIndex - digits.length)}`
  }
  return `${sign}${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`
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
