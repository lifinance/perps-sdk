/**
 * Order validation utilities.
 */

import { estimateFees } from './calculations.js'

/**
 * Validate margin input against available balance and exchange minimums.
 *
 * @param margin - Margin amount in USD
 * @param leverage - Position leverage
 * @param availableBalance - Available balance, or null if unknown
 * @param feeRate - Fee rate as decimal, or null if unknown
 * @param minMarginUsd - Minimum margin requirement in USD (exchange-specific)
 * @returns Error code: 'insufficient' | 'below-minimum' | '' (valid)
 */
export function validateMargin(
  margin: number,
  leverage: number,
  availableBalance: number | null,
  feeRate: number | null,
  minMarginUsd: number
): string {
  if (margin <= 0) {
    return ''
  }

  if (availableBalance !== null && margin > availableBalance) {
    return 'insufficient'
  }

  const fee = feeRate !== null ? estimateFees(margin * leverage, feeRate) : 0
  if (margin - fee < minMarginUsd) {
    return 'below-minimum'
  }

  return ''
}
