import { PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { formatUnits } from 'viem'
import { PerpsError } from '../errors/PerpsError.js'
import { createSafeFunction } from '../utils/createSafeFunction.js'
import { bigToDecimalString, decimalStringToBig } from './decimalStringToBig.js'
import { isDecimalString } from './parse.js'

/**
 * Off-grid resolution for {@link roundDecimalString}:
 * - `truncate`: toward zero, for sizes and collateral amounts. The result
 *   never exceeds the caller's intent.
 * - `round`: half away from zero, for prices, which snap to the nearest tick.
 * - `up`: away from zero, for an amount that must cover a target.
 * @public
 */
export type DecimalRounding = 'truncate' | 'round' | 'up'

const BIG_ROUNDING = {
  truncate: Big.roundDown,
  round: Big.roundHalfUp,
  up: Big.roundUp,
} as const

/**
 * Round a decimal string to `decimals` places with exact decimal arithmetic.
 * The result has no trailing zeros: `roundDecimalString('1.50', 1, 'round')`
 * is `'1.5'`.
 *
 * @throws {PerpsError} `ValidationError` when `value` does not match the decimal pattern,
 *   or `decimals` is not a non-negative integer.
 * @public
 */
export function roundDecimalString(
  value: string,
  decimals: number,
  rounding: DecimalRounding
): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid decimals for rounding: ${decimals}`
    )
  }
  return bigToDecimalString(
    decimalStringToBig(value).round(decimals, BIG_ROUNDING[rounding])
  )
}

/**
 * {@link roundDecimalString}, or `undefined` with a warning when it throws.
 *
 * @public
 */
export const safeRoundDecimalString = createSafeFunction(
  'roundDecimalString',
  roundDecimalString
)

/**
 * Scale a decimal string to an integer at `decimals` places in exact decimal
 * arithmetic: `'0.29'` at 2 decimals is 29, never 28. Off-grid input resolves
 * per `rounding`. No `$`, `%` or `,` is removed first.
 *
 * @throws {PerpsError} `ValidationError` when `value` does not match the decimal pattern,
 *   `decimals` is not a non-negative integer, or the result's magnitude
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 * @public
 */
export function decimalStringToScaledInteger(
  value: string,
  decimals: number,
  rounding: DecimalRounding
): number {
  if (!isDecimalString(value)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `'${value}' does not match the decimal pattern.`
    )
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid decimals for integer scaling: ${decimals}`
    )
  }
  const scaled = new Big(value)
    .times(new Big(10).pow(decimals))
    .round(0, BIG_ROUNDING[rounding])
  if (scaled.abs().gt(Number.MAX_SAFE_INTEGER)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Scaled value ${scaled.toFixed()} exceeds Number.MAX_SAFE_INTEGER and cannot be encoded exactly.`
    )
  }
  return scaled.toNumber()
}

/**
 * {@link decimalStringToScaledInteger}, or `undefined` with a warning when it
 * throws.
 *
 * @public
 */
export const safeDecimalStringToScaledInteger = createSafeFunction(
  'decimalStringToScaledInteger',
  decimalStringToScaledInteger
)

export const BASE_UNITS_PATTERN = /^-?\d+$/

/**
 * Convert a scaled integer string (a token amount in base units) to a decimal
 * string: `scaledIntegerToDecimalString('1000000', 6)` is `'1'`.
 *
 * @throws {PerpsError} `ValidationError` when `amount` is not an integer
 *   string, or `decimals` is not a non-negative integer.
 * @public
 */
export function scaledIntegerToDecimalString(
  amount: string,
  decimals: number
): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid \`scaledIntegerToDecimalString(decimals)\`: ${decimals} is not a non-negative integer.`
    )
  }
  if (!BASE_UNITS_PATTERN.test(amount)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid \`scaledIntegerToDecimalString(amount)\`: '${amount}' is not an integer base-unit string.`
    )
  }
  return formatUnits(BigInt(amount), decimals)
}

/**
 * {@link scaledIntegerToDecimalString}, or `undefined` with a warning when it
 * throws.
 *
 * @public
 */
export const safeScaledIntegerToDecimalString = createSafeFunction(
  'scaledIntegerToDecimalString',
  scaledIntegerToDecimalString
)

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
export function numberToDecimalString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid number for decimal conversion: ${value}`
    )
  }
  const parsed = new Big(value)
  return (parsed.eq(0) ? new Big(0) : parsed).toFixed()
}

/**
 * {@link numberToDecimalString}, or `undefined` with a warning when it throws.
 *
 * @public
 */
export const safeNumberToDecimalString = createSafeFunction(
  'numberToDecimalString',
  numberToDecimalString
)
