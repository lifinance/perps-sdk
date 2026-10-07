import type { DecimalString } from '@lifi/perps-types'
import Big from 'big.js'
import { isDecimalString } from './parse.js'
import { requireDecimal } from './requireDecimal.js'

/**
 * Exact `a > b` on two {@link DecimalString}s, with no float rounding, so a
 * funds gate can tell `'1.0000000000000001'` from `'1'`. The other relations
 * follow from it: `a <= b` is `!isDecimalStringGreaterThan(a, b)`.
 *
 * @throws {PerpsError} `ValidationError` when either operand is not a decimal string.
 * @public
 */
export function isDecimalStringGreaterThan(
  a: DecimalString,
  b: DecimalString
): boolean {
  return requireDecimal(a, 'a').gt(requireDecimal(b, 'b'))
}

/**
 * Exact `value == 0` on a venue decimal string, so a flat-position check never
 * reads `'0.0'` as non-zero or `'10oops'` as `10`.
 *
 * @returns `false` when `value` is not a decimal string, so a malformed size
 *   is never taken as flat.
 * @public
 */
export function isDecimalStringZero(value: DecimalString): boolean {
  return isDecimalString(value) && new Big(value).eq(0)
}
