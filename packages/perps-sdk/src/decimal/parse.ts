import {
  DECIMAL_PATTERN,
  type DecimalString,
  PerpsErrorCode,
} from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'

/**
 * Parse a string to a float, stripping common formatting artefacts.
 *
 * Handles:
 * - Currency prefixes/suffixes ($, USD, etc.)
 * - Explicit sign prefixes (+/-)
 * - Thousands separators (commas)
 * - Percentage suffixes (%)
 * - Whitespace
 *
 * @returns Parsed number; `0` for empty/blank input, `NaN` when a non-empty
 *   string contains no parseable number
 */
function toFloat(value: string): number {
  if (!value) {
    return 0
  }
  const cleaned = value.trim().replace(/[$%]/g, '').replace(/,/g, '').trim()
  if (!cleaned) {
    return 0
  }
  return parseFloat(cleaned)
}

const FORMATTED_NUMBER =
  /^(?:[+-]\s*)?(?:\$\s*)?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?:\s*(?:%|USD))?$/i

/**
 * Parse an optional decimal field, tolerating currency symbols, grouping
 * separators and a percentage suffix around the number.
 * Gives back `undefined` for a missing, malformed or non-finite value, and `0` for an empty string.
 *
 * @public
 */
export function parseDecimal(
  value: DecimalString | string | null | undefined
): number | undefined {
  if (value == null) {
    return undefined
  }
  if (value.trim() === '') {
    return toFloat(value)
  }
  if (!FORMATTED_NUMBER.test(value.trim())) {
    return undefined
  }
  const parsed = toFloat(value)
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
