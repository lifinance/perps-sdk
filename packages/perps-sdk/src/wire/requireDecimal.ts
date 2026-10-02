import {
  type DecimalString,
  isDecimalString,
  PerpsErrorCode,
} from '@lifi/perps-types'
import Big from 'big.js'
import { PerpsError } from '../errors/PerpsError.js'

/**
 * Parse a wire-tier decimal input, naming the field it came from when the
 * value breaks the {@link DecimalString} contract, so a malformed amount
 * fails at the SDK boundary instead of inside big.js.
 *
 * @throws {PerpsError} `ValidationError` naming `field`.
 */
export function requireDecimal(value: DecimalString, field: string): Big {
  if (!isDecimalString(value)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid \`${field}\`: '${value}' is not a decimal string.`
    )
  }
  return new Big(value)
}
