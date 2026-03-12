/**
 * Order size and price formatting for exchange submission.
 *
 * These encode exchange-specific order submission rules. Getting size/price
 * formatting wrong causes rejected orders. Currently implements Hyperliquid
 * rules; as the SDK goes multi-dex, these should move behind a provider
 * interface.
 *
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size
 */

/**
 * Max combined decimals (size + price) enforced by Hyperliquid.
 */
const MAX_DECIMALS_PERPS = 6

/**
 * Derive the maximum number of price decimal places for a given asset.
 *
 * @param szDecimals - The asset's szDecimals (from market meta)
 * @returns Maximum allowed price decimals
 */
export function getMaxPriceDecimals(szDecimals: number): number {
  return Math.max(0, MAX_DECIMALS_PERPS - szDecimals)
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
 */
export function formatOrderSize(size: number, szDecimals: number): string {
  // Truncate (don't round up) to avoid exceeding available balance
  const multiplier = 10 ** szDecimals
  const truncated = Math.floor(size * multiplier) / multiplier
  // Remove trailing zeros by converting through parseFloat
  return parseFloat(truncated.toFixed(szDecimals)).toString()
}

/**
 * Format a price value for order submission.
 *
 * Per Hyperliquid docs (tick-and-lot-size):
 * - Maximum 5 significant figures
 * - Max decimals = MAX_DECIMALS - szDecimals (MAX_DECIMALS = 6 for perps)
 * - Integer prices always allowed regardless of significant figures
 * - Trailing zeroes must be removed for signing
 *
 * @param price - The price value to format
 * @param szDecimals - The asset's szDecimals (affects max price decimals)
 * @returns Price as a string with correct precision, no trailing zeros
 */
export function formatOrderPrice(price: number, szDecimals: number): string {
  const maxPriceDecimals = getMaxPriceDecimals(szDecimals)

  // Round to max allowed decimals
  let rounded = parseFloat(price.toFixed(maxPriceDecimals))

  // Integer prices are always allowed regardless of significant figures
  if (Number.isInteger(rounded)) {
    return rounded.toString()
  }

  // Count significant figures (digits excluding leading zeros)
  const absStr = Math.abs(rounded).toString().replace('.', '')
  const sigFigs = absStr.replace(/^0+/, '').length

  // If more than 5 significant figures, round to 5
  if (sigFigs > 5) {
    rounded = parseFloat(rounded.toPrecision(5))
  }

  // Return without trailing zeros
  return rounded.toString()
}
