import { timestampToIsoString } from '@lifi/perps-sdk'

/**
 * Read a venue row time as an ISO-8601 string, or `undefined` when the time is
 * not valid. The caller logs the row skip, so this logs nothing.
 */
export const rowTimestampToIsoStringOrUndefined = (
  value: string | number
): string | undefined => {
  try {
    return timestampToIsoString(value)
  } catch {
    return undefined
  }
}
