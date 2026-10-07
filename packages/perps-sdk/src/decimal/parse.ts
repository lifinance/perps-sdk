import { DECIMAL_PATTERN, PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { PerpsError } from '../errors/PerpsError.js'
import { createSafeFunction } from '../utils/createSafeFunction.js'
import { decimalStringToBig } from './decimalStringToBig.js'

/**
 * Read a decimal string as a JS float, for a chart or pixel value only. A
 * float holds about 15 significant digits, so the result can lose precision;
 * never use it for an amount sent to a venue.
 *
 * @throws {PerpsError} `ValidationError` when `value` is not a decimal string
 *   or is too large for a finite float.
 * @public
 */
export function decimalStringToNumber(value: string): number {
  const parsed = decimalStringToBig(value).toNumber()
  if (!Number.isFinite(parsed)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `'${value}' is too large for a finite number.`
    )
  }
  return parsed
}

/**
 * {@link decimalStringToNumber}, or `undefined` with a warning when it throws.
 *
 * @public
 */
export const safeDecimalStringToNumber = createSafeFunction(
  'decimalStringToNumber',
  decimalStringToNumber
)

/**
 * Narrows an unknown value to a {@link DecimalString}. No characters are
 * removed first.
 *
 * @public
 */
export function isDecimalString(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_PATTERN.test(value)
}

const MAX_SPELLED_EXPONENT = 1000

function spellDecimal(value: unknown): string | undefined {
  if (isDecimalString(value)) {
    return value
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return undefined
  }
  let parsed: Big
  try {
    parsed = new Big(value)
  } catch {
    return undefined
  }
  // Spelling out an unbounded exponent builds a string of that many digits.
  if (Math.abs(parsed.e) > MAX_SPELLED_EXPONENT) {
    return undefined
  }
  return (parsed.eq(0) ? new Big(0) : parsed).toFixed()
}

/**
 * Read a venue value (a string or a number) as a decimal string, for a
 * money-path value that must not go on wrong. A number or an exponent string
 * is spelled out in full; no `$`, `%` or `,` is removed.
 *
 * @param tool - Provider key set on the error.
 * @throws {PerpsError} `SDKError` naming `field` when `value` is not a finite
 *   decimal.
 * @public
 */
export function unknownToDecimalString(
  value: unknown,
  field: string,
  tool: string
): string {
  const decimal = spellDecimal(value)
  if (decimal !== undefined) {
    return decimal
  }
  const error = new PerpsError(
    PerpsErrorCode.SDKError,
    `${tool} field \`${field}\` is not a valid decimal: '${String(value)}'`
  )
  error.tool = tool
  throw error
}
