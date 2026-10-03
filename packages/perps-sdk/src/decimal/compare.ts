import type { DecimalString } from '@lifi/perps-types'
import { requireDecimal } from './requireDecimal.js'

/**
 * Exact `a > b` on two {@link DecimalString}s, with no float rounding, so a
 * funds gate can tell `'1.0000000000000001'` from `'1'`. The other relations
 * follow from it: `a <= b` is `!isDecimalGreaterThan(a, b)`.
 *
 * @throws {PerpsError} `ValidationError` when either operand is not a decimal string.
 * @public
 */
export function isDecimalGreaterThan(
  a: DecimalString,
  b: DecimalString
): boolean {
  return requireDecimal(a, 'a').gt(requireDecimal(b, 'b'))
}
