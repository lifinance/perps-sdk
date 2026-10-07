import { DECIMAL_PATTERN, PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { PerpsError } from '../errors/PerpsError.js'
import { DivBig } from './big.js'

/**
 * Read a decimal string as a `Big`. The string must match `DECIMAL_PATTERN`,
 * so `'$1,234.5'`, `'0.05%'` and the exponent form `'1e5'` are rejected.
 *
 * @throws {PerpsError} `ValidationError` when `value` does not match the
 *   decimal pattern.
 * @internal
 */
export function decimalStringToBig(value: string): Big {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `'${String(value)}' does not match the decimal pattern.`
    )
  }
  return new Big(value)
}

/**
 * Spell a `Big` as a canonical decimal string, with no exponent and no `-0`.
 *
 * @internal
 */
export function bigToDecimalString(value: Big): string {
  return value.eq(0) ? '0' : value.toFixed()
}

/**
 * {@link decimalStringToBig} as a `DivBig`, so a later `div` keeps 40 decimal
 * places.
 *
 * @throws {PerpsError} `ValidationError` as {@link decimalStringToBig}.
 * @internal
 */
export function decimalStringToDivBig(value: string): Big {
  return new DivBig(decimalStringToBig(value))
}
