import { PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { PerpsError } from '../errors/PerpsError.js'

/**
 * Off-grid resolution for {@link scaleToInteger}:
 * - `truncate` — toward zero, for sizes and collateral amounts. The wire
 *   value never exceeds the caller's intent.
 * - `round` — half away from zero, for prices, which snap to the nearest
 *   tick.
 * @public
 */
export type ScaleToIntegerPolicy = 'truncate' | 'round'

/**
 * Scale a human-readable decimal string to a scaled integer in exact decimal
 * arithmetic — an on-grid input maps to its exact scaled integer with no
 * binary float artifacts (`'0.29'` at 2 decimals is 29, never 28).
 * Off-grid input resolves per `policy`; there is no silent default.
 *
 * @throws {PerpsError} `ValidationError` when `value` is not a decimal
 *   numeric string, `decimals` is not a non-negative integer, or the scaled
 *   result's magnitude exceeds `Number.MAX_SAFE_INTEGER`.
 * @public
 */
export const scaleToInteger = (
  value: string,
  decimals: number,
  policy: ScaleToIntegerPolicy
): number => {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid decimals for Lighter integer scaling: ${decimals}`
    )
  }
  let parsed: Big
  try {
    parsed = new Big(value)
  } catch {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid decimal string for Lighter integer scaling: '${value}'`
    )
  }
  const scaled = parsed
    .times(new Big(10).pow(decimals))
    .round(0, policy === 'truncate' ? Big.roundDown : Big.roundHalfUp)
  if (scaled.abs().gt(Number.MAX_SAFE_INTEGER)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Scaled value ${scaled.toFixed()} exceeds Number.MAX_SAFE_INTEGER and cannot be encoded exactly.`
    )
  }
  return scaled.toNumber()
}
