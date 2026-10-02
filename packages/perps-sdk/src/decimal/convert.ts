import { type DecimalString, PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { formatUnits } from 'viem'
import { PerpsError } from '../errors/PerpsError.js'
import { parseDecimal } from './parse.js'

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
 * @deprecated Use `BaseUnitsRounding`. Removed in the next major.
 */
export type ScaleToIntegerPolicy = BaseUnitsRounding

/**
 * Scale a decimal string to a scaled integer in exact decimal arithmetic — an
 * on-grid input maps to its exact scaled integer with no binary float
 * artifacts (`'0.29'` at 2 decimals is 29, never 28). Off-grid input resolves
 * per `rounding`; there is no silent default.
 *
 * @throws {PerpsError} `ValidationError` when `value` is not a decimal
 *   numeric string, `decimals` is not a non-negative integer, or the scaled
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
  let parsed: Big
  try {
    parsed = new Big(value)
  } catch {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid decimal string for integer scaling: '${value}'`
    )
  }
  const scaled = parsed
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

/**
 * @deprecated Use `decimalToBaseUnits`. Removed in the next major.
 */
export const scaleToInteger = decimalToBaseUnits

/**
 * Convert a base-unit amount (bigint string) to a decimal string.
 *
 * @param amount - Amount in base units (e.g. "1000000" for 1 USDC)
 * @param decimals - Token decimals (e.g. 6 for USDC)
 * @returns Decimal string; `"0"` when `amount` is not a valid bigint
 * @example
 * ```ts
 * baseUnitsToDecimal('1000000', 6) // '1'
 * ```
 * @public
 */
export function baseUnitsToDecimal(
  amount: string,
  decimals: number
): DecimalString {
  try {
    return formatUnits(BigInt(amount), decimals)
  } catch {
    return '0'
  }
}

/**
 * @deprecated Use `baseUnitsToDecimal`. Removed in the next major.
 */
export const fromBaseUnits = baseUnitsToDecimal

/**
 * @deprecated Compose `parseDecimal(baseUnitsToDecimal(...))`. Removed in the
 * next major.
 */
export function fromBaseUnitsNumber(amount: string, decimals: number): number {
  return parseDecimal(baseUnitsToDecimal(amount, decimals)) ?? 0
}
