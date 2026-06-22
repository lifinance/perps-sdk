/**
 * Token unit conversion utilities.
 */

import { formatUnits } from 'viem'

/**
 * Convert a base-unit amount (bigint string) to a human-readable decimal string.
 *
 * @param amount - Amount in base units (e.g. "1000000" for 1 USDC)
 * @param decimals - Token decimals (e.g. 6 for USDC)
 * @returns Decimal string (e.g. "1.0"); `"0"` when `amount` is not a valid
 *   bigint
 * @example
 * ```ts
 * fromBaseUnits('1000000', 6) // '1'
 * ```
 * @public
 */
export function fromBaseUnits(amount: string, decimals: number): string {
  try {
    return formatUnits(BigInt(amount), decimals)
  } catch {
    return '0'
  }
}

/**
 * Convert a base-unit amount to a number.
 *
 * @param amount - Amount in base units
 * @param decimals - Token decimals
 * @returns Numeric value, or 0 if parsing fails
 * @public
 */
export function fromBaseUnitsNumber(amount: string, decimals: number): number {
  const value = Number(fromBaseUnits(amount, decimals))
  return Number.isFinite(value) ? value : 0
}
