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
