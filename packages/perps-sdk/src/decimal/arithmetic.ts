import { PerpsErrorCode } from '@lifi/perps-types'
import type Big from 'big.js'
import { PerpsError } from '../errors/PerpsError.js'
import { createSafeFunction } from '../utils/createSafeFunction.js'
import { DivBig, TruncBig } from './big.js'
import { bigToDecimalString, decimalStringToBig } from './decimalStringToBig.js'

/**
 * Exact `a + b`.
 *
 * @throws {PerpsError} `ValidationError` when an input does not match the decimal pattern.
 * @public
 */
export function addDecimalString(a: string, b: string): string {
  return bigToDecimalString(decimalStringToBig(a).plus(decimalStringToBig(b)))
}

/**
 * {@link addDecimalString}, or `undefined` with a warning when it throws.
 *
 * @public
 */
export const safeAddDecimalString = createSafeFunction(
  'addDecimalString',
  addDecimalString
)

/**
 * Exact sum of every value; `'0'` for an empty list.
 *
 * @throws {PerpsError} `ValidationError` when a value does not match the
 *   decimal pattern.
 * @public
 */
export function addDecimalStrings(values: readonly string[]): string {
  return bigToDecimalString(
    values.reduce<Big>(
      (sum, value) => sum.plus(decimalStringToBig(value)),
      decimalStringToBig('0')
    )
  )
}

/**
 * {@link addDecimalStrings}, or `undefined` with a warning when it throws.
 * One bad value gives `undefined`, never a partial sum.
 *
 * @public
 */
export const safeAddDecimalStrings = createSafeFunction(
  'addDecimalStrings',
  addDecimalStrings
)

/**
 * Exact `a - b`.
 *
 * @throws {PerpsError} `ValidationError` when an input does not match the decimal pattern.
 * @public
 */
export function subtractDecimalString(a: string, b: string): string {
  return bigToDecimalString(decimalStringToBig(a).minus(decimalStringToBig(b)))
}

/**
 * {@link subtractDecimalString}, or `undefined` with a warning when it throws.
 *
 * @public
 */
export const safeSubtractDecimalString = createSafeFunction(
  'subtractDecimalString',
  subtractDecimalString
)

/**
 * Exact `a × b`.
 *
 * @throws {PerpsError} `ValidationError` when an input does not match the decimal pattern.
 * @public
 */
export function multiplyDecimalString(a: string, b: string): string {
  return bigToDecimalString(decimalStringToBig(a).times(decimalStringToBig(b)))
}

/**
 * {@link multiplyDecimalString}, or `undefined` with a warning when it throws.
 *
 * @public
 */
export const safeMultiplyDecimalString = createSafeFunction(
  'multiplyDecimalString',
  multiplyDecimalString
)

function requireNonZeroDivisor(divisor: string): Big {
  const parsed = decimalStringToBig(divisor)
  if (parsed.eq(0)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Division by zero: divisor '${divisor}'.`
    )
  }
  return parsed
}

/**
 * `a ÷ b` to 40 decimal places, rounded half up.
 *
 * @throws {PerpsError} `ValidationError` when an input is not a decimal
 *   string or `b` is zero.
 * @public
 */
export function divideDecimalString(a: string, b: string): string {
  const divisor = requireNonZeroDivisor(b)
  return bigToDecimalString(new DivBig(decimalStringToBig(a)).div(divisor))
}

/**
 * {@link divideDecimalString}, or `undefined` with a warning when it throws.
 *
 * @public
 */
export const safeDivideDecimalString = createSafeFunction(
  'divideDecimalString',
  divideDecimalString
)

/**
 * `a ÷ b` to 40 decimal places, truncated toward zero, so a derived amount
 * never exceeds the exact quotient.
 *
 * @throws {PerpsError} `ValidationError` when an input is not a decimal
 *   string or `b` is zero.
 * @public
 */
export function divideDecimalStringRoundDown(a: string, b: string): string {
  const divisor = requireNonZeroDivisor(b)
  return bigToDecimalString(new TruncBig(decimalStringToBig(a)).div(divisor))
}

/**
 * {@link divideDecimalStringRoundDown}, or `undefined` with a warning when it
 * throws.
 *
 * @public
 */
export const safeDivideDecimalStringRoundDown = createSafeFunction(
  'divideDecimalStringRoundDown',
  divideDecimalStringRoundDown
)

/**
 * Exact `|value|`.
 *
 * @throws {PerpsError} `ValidationError` when `value` does not match the decimal pattern.
 * @public
 */
export function absDecimalString(value: string): string {
  return bigToDecimalString(decimalStringToBig(value).abs())
}

/**
 * {@link absDecimalString}, or `undefined` with a warning when it throws.
 *
 * @public
 */
export const safeAbsDecimalString = createSafeFunction(
  'absDecimalString',
  absDecimalString
)
