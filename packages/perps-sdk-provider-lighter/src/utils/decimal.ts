import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
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

/**
 * Parse a required venue decimal and identify the bad field on failure.
 * @public
 */
export const toRequiredBig = (
  value: string | undefined,
  field: string
): Big => {
  const parsed = toBigOrNull(value)
  if (parsed !== null) {
    return parsed
  }
  throw new PerpsError(
    PerpsErrorCode.SDKError,
    `Lighter field \`${field}\` is not a valid decimal.`
  )
}
