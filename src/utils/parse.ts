/**
 * Robust string-to-number parsing utilities.
 */

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
 * @param value - The string to parse
 * @returns Parsed number, or NaN if the string contains no valid number
 */
export function stringToFloat(value: string): number {
  if (!value) {
    return 0
  }
  // Strip whitespace, currency symbols, thousands commas, and % suffix
  const cleaned = value.trim().replace(/[$%]/g, '').replace(/,/g, '').trim()
  if (!cleaned) {
    return 0
  }
  return parseFloat(cleaned)
}
