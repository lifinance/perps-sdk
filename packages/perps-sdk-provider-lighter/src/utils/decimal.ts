import Big from 'big.js'

/**
 * Exact-decimal parse of a venue decimal string; null when absent or
 * unparsable, so callers can gate on presence before deriving.
 * @public
 */
export const toBigOrNull = (value: string | undefined): Big | null => {
  if (value === undefined) {
    return null
  }
  try {
    return new Big(value)
  } catch {
    return null
  }
}
