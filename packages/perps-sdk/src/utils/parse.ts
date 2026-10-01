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
 * @example
 * ```ts
 * stringToFloat('$1,234.50') // 1234.5
 * stringToFloat('') // 0
 * ```
 * @public
 */
export function stringToFloat(value: string): number {
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
 * Parse an optional decimal field, with the same formatting tolerance as {@link stringToFloat}.
 * Gives back `undefined` for a missing, malformed or non-finite value, and `0` for an empty string.
 *
 * @public
 */
export function parseDecimal(
  value: string | null | undefined
): number | undefined {
  if (value == null) {
    return undefined
  }
  if (value.trim() === '') {
    return stringToFloat(value)
  }
  if (!FORMATTED_NUMBER.test(value.trim())) {
    return undefined
  }
  const parsed = stringToFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
