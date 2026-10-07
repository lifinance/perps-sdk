import { type DecimalString, PerpsErrorCode } from '@lifi/perps-types'
import type Big from 'big.js'
import { DivBig } from '../decimal/big.js'
import { BASE_UNITS_PATTERN } from '../decimal/convert.js'
import { decimalStringToDivBig } from '../decimal/decimalStringToBig.js'
import { PerpsError } from '../errors/PerpsError.js'

/**
 * Headroom, in percent, that {@link calculateRefuelAmount} adds over the gas
 * deficit to pay the refuel route's own swap and bridge fees.
 *
 * @public
 */
export const REFUEL_FEE_MARGIN_PERCENT = 20

/** @public */
export interface RefuelAmountInput {
  /** Native gas amount the LI.FI gas suggestion recommends, in base units. */
  recommendedAmount: DecimalString
  /** USD value of `recommendedAmount`. */
  recommendedUsd: DecimalString
  /** Native balance the wallet holds on the recommendation's chain, in base units. */
  nativeBalance: DecimalString
  /** USD price of one whole source token. */
  priceUsd: DecimalString
  /** Decimals of the source token, which the result is spelled to exactly. */
  decimals: number
}

function requireBaseUnits(value: DecimalString, field: string): Big {
  if (!BASE_UNITS_PATTERN.test(value)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid \`${field}\`: '${value}' is not an integer base-unit string.`
    )
  }
  return new DivBig(value)
}

/**
 * Source-token amount that buys the native gas the wallet lacks: the part of
 * the recommendation above `nativeBalance`, valued pro rata on
 * `recommendedUsd`, plus {@link REFUEL_FEE_MARGIN_PERCENT}. Rounded **up**
 * onto the token's decimal grid so a refuel never lands short, and spelled
 * with trailing zeros to `decimals` to seed an amount input.
 *
 * @returns `undefined` when the wallet already holds the recommendation, or
 *   when `recommendedAmount`, `recommendedUsd` or `priceUsd` is not greater
 *   than zero: a route with nothing to refuel, not a failure.
 * @throws {PerpsError} `ValidationError` when a base-unit field is not an
 *   integer string, a USD field does not match the decimal pattern, or `decimals`
 *   is not a non-negative integer.
 * @public
 */
export function calculateRefuelAmount(
  input: RefuelAmountInput
): DecimalString | undefined {
  const { decimals } = input
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid \`decimals\` for a refuel amount: ${decimals}`
    )
  }
  const recommended = requireBaseUnits(
    input.recommendedAmount,
    'recommendedAmount'
  )
  const balance = requireBaseUnits(input.nativeBalance, 'nativeBalance')
  const recommendedUsd = decimalStringToDivBig(input.recommendedUsd)
  const priceUsd = decimalStringToDivBig(input.priceUsd)
  const deficit = recommended.minus(balance)
  if (
    !recommended.gt(0) ||
    !recommendedUsd.gt(0) ||
    !priceUsd.gt(0) ||
    !deficit.gt(0)
  ) {
    return undefined
  }
  return recommendedUsd
    .times(deficit)
    .times(100 + REFUEL_FEE_MARGIN_PERCENT)
    .div(recommended.times(100).times(priceUsd))
    .round(decimals, DivBig.roundUp)
    .toFixed(decimals)
}
