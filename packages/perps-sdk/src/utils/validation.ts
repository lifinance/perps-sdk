/**
 * Order validation utilities.
 */

/**
 * Validate margin input against available balance and exchange minimums.
 *
 * @param margin - Margin amount in USD
 * @param _leverage - Position leverage (reserved for future use)
 * @param availableBalance - Available balance, or null if unknown
 * @param _feeRate - Fee rate as decimal, or null if unknown (reserved for future use)
 * @param minMarginUsd - Minimum margin requirement in USD (exchange-specific).
 *   Source this from the selected provider's `minOrderValueUsd` metadata
 *   (see `@lifi/perps-types` `Provider`) rather than a client-side constant.
 * @returns Error code: 'insufficient' | 'below-minimum' | '' (valid)
 * @public
 */
export function validateMargin(
  margin: number,
  _leverage: number,
  availableBalance: number | null,
  _feeRate: number | null,
  minMarginUsd: number
): string {
  if (margin <= 0) {
    return ''
  }

  if (availableBalance !== null && margin > availableBalance) {
    return 'insufficient'
  }

  if (margin < minMarginUsd) {
    return 'below-minimum'
  }

  return ''
}
