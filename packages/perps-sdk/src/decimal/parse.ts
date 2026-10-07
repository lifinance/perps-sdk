import {
  DECIMAL_PATTERN,
  type DecimalString,
  PerpsErrorCode,
} from '@lifi/perps-types'
import Big from 'big.js'
import { PerpsError } from '../errors/PerpsError.js'

function toFloat(value: string): number {
  if (!value) {
    return 0
  }
  const cleaned = value.replace(/[\s$%,]/g, '')
  if (!cleaned) {
    return 0
  }
  return parseFloat(cleaned)
}

const FORMATTED_NUMBER =
  /^(?:[+-]\s*)?(?:\$\s*)?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?:\s*(?:%|USD))?$/i

/**
 * Read human-formatted text as a JS float, removing currency symbols, grouping
 * separators and a percentage suffix around the number.
 *
 * @returns `0` for blank text, and `undefined` for missing, malformed or
 *   non-finite text.
 * @public
 */
export function formattedStringToNumber(
  text: string | null | undefined
): number | undefined {
  if (text == null) {
    return undefined
  }
  if (text.trim() === '') {
    return 0
  }
  if (!FORMATTED_NUMBER.test(text.trim())) {
    return undefined
  }
  const parsed = toFloat(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Read a {@link DecimalString} as a JS float for display math. No formatting
 * is removed.
 *
 * @returns `undefined` for a missing or invalid value, or one too large for a
 *   finite float.
 * @public
 */
export function decimalStringToNumber(
  value: DecimalString | null | undefined
): number | undefined {
  if (!isDecimalString(value)) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Narrows an unknown value to a {@link DecimalString}.
 *
 * @public
 */
export function isDecimalString(value: unknown): value is DecimalString {
  return typeof value === 'string' && DECIMAL_PATTERN.test(value)
}

/**
 * Check a decimal input against the {@link DecimalString} contract, naming
 * the field it came from, so a malformed amount fails at the SDK boundary
 * instead of inside big.js.
 *
 * @returns `value`, unchanged.
 * @throws {PerpsError} `ValidationError` naming `field`.
 * @public
 */
export function validateDecimalString(
  value: DecimalString,
  field: string
): DecimalString {
  if (!isDecimalString(value)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid \`${field}\`: '${value}' is not a decimal string.`
    )
  }
  return value
}

const MAX_SPELLED_EXPONENT = 1000

/**
 * Read a venue value as a {@link DecimalString} for display. A number or an
 * exponent string is spelled out in full; a value already in the pattern is
 * returned unchanged.
 *
 * @returns `undefined` for any value that is not a finite decimal, or whose
 *   exponent is above 1000 in magnitude. Never throws.
 * @public
 */
export function asDecimalString(value: unknown): DecimalString | undefined {
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
 * Read a required venue value as a {@link DecimalString}, for account and
 * balance math that must not go on with a wrong total.
 *
 * @param tool - Provider key set on the error.
 * @throws {PerpsError} `SDKError` naming `field` when `value` is not a finite decimal.
 * @public
 */
export function requireVenueDecimal(
  value: unknown,
  field: string,
  tool: string
): DecimalString {
  const decimal = asDecimalString(value)
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
