import { type DecimalString, PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { formatUnits } from 'viem'
import { PerpsError } from '../errors/PerpsError.js'
import { requireDecimal } from './requireDecimal.js'

/**
 * Off-grid resolution for {@link decimalToBaseUnits}:
 * - `truncate` — toward zero, for sizes and collateral amounts. The wire
 *   value never exceeds the caller's intent.
 * - `round` — half away from zero, for prices, which snap to the nearest
 *   tick.
 * @public
 */
export type BaseUnitsRounding = 'truncate' | 'round'

/**
 * Scale a decimal string to a scaled integer in exact decimal arithmetic — an
 * on-grid input maps to its exact scaled integer with no binary float
 * artifacts (`'0.29'` at 2 decimals is 29, never 28). Off-grid input resolves
 * per `rounding`; there is no silent default.
 *
 * @throws {PerpsError} `ValidationError` when `value` is not a
 *   {@link DecimalString}, `decimals` is not a non-negative integer, or the scaled
 *   result's magnitude exceeds `Number.MAX_SAFE_INTEGER`.
 * @public
 */
export const decimalToBaseUnits = (
  value: DecimalString,
  decimals: number,
  rounding: BaseUnitsRounding
): number => {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid decimals for integer scaling: ${decimals}`
    )
  }
  const scaled = requireDecimal(value, 'decimalToBaseUnits(value)')
    .times(new Big(10).pow(decimals))
    .round(0, rounding === 'truncate' ? Big.roundDown : Big.roundHalfUp)
  if (scaled.abs().gt(Number.MAX_SAFE_INTEGER)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Scaled value ${scaled.toFixed()} exceeds Number.MAX_SAFE_INTEGER and cannot be encoded exactly.`
    )
  }
  return scaled.toNumber()
}

export const BASE_UNITS_PATTERN = /^-?\d+$/

/**
 * Convert a base-unit amount (integer string) to a decimal string.
 *
 * @param amount - Amount in base units (e.g. "1000000" for 1 USDC)
 * @param decimals - Token decimals (e.g. 6 for USDC)
 * @throws {PerpsError} `ValidationError` when `amount` is not an integer
 *   string, or `decimals` is not a non-negative integer.
 * @example
 * ```ts
 * baseUnitsToDecimal('1000000', 6) // '1'
 * ```
 * @public
 */
export function baseUnitsToDecimal(
  amount: DecimalString,
  decimals: number
): DecimalString {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid \`baseUnitsToDecimal(decimals)\`: ${decimals} is not a non-negative integer.`
    )
  }
  if (!BASE_UNITS_PATTERN.test(amount)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid \`baseUnitsToDecimal(amount)\`: '${amount}' is not an integer base-unit string.`
    )
  }
  return formatUnits(BigInt(amount), decimals)
}

/**
 * Round `value` down to `decimals` and pad the result to exactly that many
 * decimal places. The padding is the point: this seeds a fixed-decimal input,
 * where `'500.00'` and `'500'` are two renderings of one amount and the field
 * wants the first. For a canonical wire amount with no trailing zeros, read
 * the amount off `calculateOrderAmounts` or a provider snap instead.
 *
 * Exact decimal arithmetic throughout, so there is no 2^53 ceiling and no
 * float artifact: `'0.01'` at 18 decimals gives
 * `'0.010000000000000000'`, which `Number#toFixed` cannot.
 *
 * @throws {PerpsError} `ValidationError` when `value` is not a
 *   {@link DecimalString}, or `decimals` is not a non-negative integer.
 * @public
 */
export function truncateDecimal(
  value: DecimalString,
  decimals: number
): DecimalString {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid decimals for truncation: ${decimals}`
    )
  }
  const truncated = requireDecimal(value, 'truncateDecimal(value)').round(
    decimals,
    Big.roundDown
  )
  // big.js carries the sign through a round to zero; '-0.00' is not a spelling.
  return (truncated.eq(0) ? new Big(0) : truncated).toFixed(decimals)
}

/**
 * Spell a `number` as a {@link DecimalString} in plain notation: `1e-7`
 * becomes `'0.0000001'`, never `'1e-7'`. The boundary helper for a venue or
 * browser API that hands out numbers; a value already spelled as a decimal
 * string must not round-trip through here, because above 15 significant
 * digits the `number` has already lost digits.
 *
 * @throws {PerpsError} `ValidationError` when `value` is `NaN` or infinite.
 * @public
 */
export function numberToDecimalString(value: number): DecimalString {
  if (!Number.isFinite(value)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid number for decimal conversion: ${value}`
    )
  }
  const parsed = new Big(value)
  return (parsed.eq(0) ? new Big(0) : parsed).toFixed()
}
