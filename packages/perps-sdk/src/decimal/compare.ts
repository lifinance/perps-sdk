import { createSafeFunction } from '../utils/createSafeFunction.js'
import { decimalStringToBig } from './decimalStringToBig.js'

/**
 * Exact `a > b` on two decimal strings, with no float rounding, so a funds
 * gate can tell `'1.0000000000000001'` from `'1'`. The other relations follow
 * from it: `a <= b` is `!isDecimalStringGreaterThan(a, b)`.
 *
 * @throws {PerpsError} `ValidationError` when either operand does not match the decimal pattern.
 * @public
 */
export function isDecimalStringGreaterThan(a: string, b: string): boolean {
  return decimalStringToBig(a).gt(decimalStringToBig(b))
}

/**
 * {@link isDecimalStringGreaterThan}, or `undefined` with a warning when it
 * throws.
 *
 * @public
 */
export const safeIsDecimalStringGreaterThan = createSafeFunction(
  'isDecimalStringGreaterThan',
  isDecimalStringGreaterThan
)

/**
 * Exact `a == b` on two decimal strings, so `'1'`, `'1.0'` and `'1.00'` are
 * equal and `'1.0000000000000001'` is not `'1'`.
 *
 * @throws {PerpsError} `ValidationError` when either operand does not match the decimal pattern, for example `'01.00'`.
 * @public
 */
export function isDecimalStringEqual(a: string, b: string): boolean {
  return decimalStringToBig(a).eq(decimalStringToBig(b))
}

/**
 * {@link isDecimalStringEqual}, or `undefined` with a warning when it throws.
 *
 * @public
 */
export const safeIsDecimalStringEqual = createSafeFunction(
  'isDecimalStringEqual',
  isDecimalStringEqual
)

/**
 * Exact `value == 0`, so a flat-position check never reads `'0.0'` as
 * non-zero.
 *
 * @throws {PerpsError} `ValidationError` when `value` does not match the decimal pattern.
 * @public
 */
export function isDecimalStringZero(value: string): boolean {
  return decimalStringToBig(value).eq(0)
}

/**
 * {@link isDecimalStringZero}, or `undefined` with a warning when it throws.
 *
 * @public
 */
export const safeIsDecimalStringZero = createSafeFunction(
  'isDecimalStringZero',
  isDecimalStringZero
)

/**
 * Exact `value` has no fractional part, so `'700.0'` is an integer and
 * `'700.5'` is not.
 *
 * @throws {PerpsError} `ValidationError` when `value` does not match the decimal pattern.
 * @public
 */
export function isDecimalStringInteger(value: string): boolean {
  return decimalStringToBig(value).mod(1).eq(0)
}

/**
 * {@link isDecimalStringInteger}, or `undefined` with a warning when it throws.
 *
 * @public
 */
export const safeIsDecimalStringInteger = createSafeFunction(
  'isDecimalStringInteger',
  isDecimalStringInteger
)

/**
 * Exact three-way compare for a sort: `-1` when `a < b`, `0` when equal, `1`
 * when `a > b`.
 *
 * @throws {PerpsError} `ValidationError` when either operand does not match the decimal pattern.
 * @public
 */
export function compareDecimalStrings(a: string, b: string): -1 | 0 | 1 {
  return decimalStringToBig(a).cmp(decimalStringToBig(b))
}

/**
 * {@link compareDecimalStrings}, or `undefined` with a warning when it throws.
 *
 * @public
 */
export const safeCompareDecimalStrings = createSafeFunction(
  'compareDecimalStrings',
  compareDecimalStrings
)
