import { type DecimalString, PerpsErrorCode } from '@lifi/perps-types'
import { DivBig } from '../decimal/big.js'
import { PerpsError } from '../errors/PerpsError.js'
import { requireDecimal } from './requireDecimal.js'

/** @public */
export interface RefuelAmountInput {
  /** USD value of the gas the route recommends. */
  gasUsd: DecimalString
  /** USD price of one whole source token. */
  priceUsd: DecimalString
  /** Decimals of the source token, which the result is spelled to exactly. */
  decimals: number
}

/**
 * Source-token amount whose USD value covers `gasUsd`, rounded **up** onto
 * the token's decimal grid so a refuel never lands short of the
 * recommendation. The result keeps trailing zeros to `decimals`, so it seeds
 * an amount input at the token's own precision.
 *
 * The quotient does not terminate for most prices, which is why this is a
 * big.js primitive: an 18-decimal token needs a ceiling at 10^-18, far past
 * what a `number` can carry.
 *
 * @returns `undefined` when `gasUsd` or `priceUsd` is not greater than zero,
 *   which is a route with nothing to refuel rather than a failure.
 * @throws {PerpsError} `ValidationError` when `gasUsd` or `priceUsd` is not a
 *   {@link DecimalString}, or when `decimals` is not a non-negative integer.
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
  const gasUsd = requireDecimal(input.gasUsd, 'gasUsd')
  const priceUsd = requireDecimal(input.priceUsd, 'priceUsd')
  if (!gasUsd.gt(0) || !priceUsd.gt(0)) {
    return undefined
  }
  return new DivBig(gasUsd)
    .div(priceUsd)
    .round(decimals, DivBig.roundUp)
    .toFixed(decimals)
}
