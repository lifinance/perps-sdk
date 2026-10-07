import { DECIMAL_PATTERN, PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { PerpsError } from '../errors/PerpsError.js'
import { DivBig } from './big.js'

const DISPLAY_CHARACTERS = /[\s$%,]/g

/**
 * Read a decimal string as a `Big`. Whitespace, `$`, `%` and `,` are removed
 * first, so `'$1,234.5'` reads as `1234.5`; the rest must match
 * `DECIMAL_PATTERN`, so an exponent form such as `'1e5'` is rejected.
 *
 * @throws {PerpsError} `ValidationError` when `value` is not a string or the
 *   cleaned string is not a decimal string.
 * @internal
 */
export function decimalStringToBig(value: string): Big {
  const cleaned =
    typeof value === 'string' ? value.replace(DISPLAY_CHARACTERS, '') : ''
  if (!DECIMAL_PATTERN.test(cleaned)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `'${String(value)}' is not a decimal string.`
    )
  }
  return new Big(cleaned)
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
