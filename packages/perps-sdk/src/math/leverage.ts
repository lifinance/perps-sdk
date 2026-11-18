import type { DecimalString } from '@lifi/perps-types'
import { divideDecimalString } from '../decimal/arithmetic.js'
import {
  isDecimalStringGreaterThan,
  isDecimalStringInteger,
} from '../decimal/compare.js'
import { isDecimalString } from '../decimal/parse.js'
import { invalidInput } from '../errors/invalidInput.js'
import { createSafeFunction } from '../utils/createSafeFunction.js'

/** Basis points in one whole unit: an IMF of `'700'` is `700 ÷ 10000`. */
export const BASIS_POINTS_PER_UNIT = '10000'

/**
 * The leverage fields of a `MarketSettings` or a `Position`: the venue's
 * native integer IMF in basis points when it stores one, and the leverage
 * multiple.
 *
 * @public
 */
export interface LeverageSource {
  leverage?: DecimalString
  initialMarginFractionBps?: DecimalString
}

/**
 * The native IMF unchanged, so a formula can read it as an exact margin
 * rate. `parameter` names the input in the error.
 *
 * @throws {PerpsError} `ValidationError` when `value` is not a positive
 *   integer decimal string.
 * @public
 */
export function validateInitialMarginFractionBps(
  value: DecimalString,
  parameter = 'initialMarginFractionBps'
): DecimalString {
  if (
    !isDecimalString(value) ||
    !isDecimalStringGreaterThan(value, '0') ||
    !isDecimalStringInteger(value)
  ) {
    throw invalidInput(parameter, `must be a positive integer, got '${value}'`)
  }
  return value
}

/**
 * The exact leverage multiple of a venue setting, for the TP/SL and
 * liquidation formulas: `10000 ÷ initialMarginFractionBps` (40 places,
 * half-up) when the native IMF is present, else `leverage` unchanged. A
 * display leverage never feeds a formula. `calculateOrderAmounts` takes the
 * IMF itself, so a derived margin stays exact.
 *
 * @throws {PerpsError} `ValidationError` when `initialMarginFractionBps` is
 *   present but not a positive integer, or when it is absent and `leverage`
 *   is absent or not a positive decimal.
 * @public
 */
export function resolveExactLeverage(source: LeverageSource): DecimalString {
  const { initialMarginFractionBps, leverage } = source
  if (initialMarginFractionBps !== undefined) {
    return divideDecimalString(
      BASIS_POINTS_PER_UNIT,
      validateInitialMarginFractionBps(initialMarginFractionBps)
    )
  }
  if (leverage === undefined || !isDecimalStringGreaterThan(leverage, '0')) {
    throw invalidInput(
      'leverage',
      `must be a positive decimal, got '${String(leverage)}'`
    )
  }
  return leverage
}

/** @public */
export const safeResolveExactLeverage = createSafeFunction(
  'resolveExactLeverage',
  resolveExactLeverage
)
