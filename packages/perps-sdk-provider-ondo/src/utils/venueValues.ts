import { timestampToIsoString, warnSkippedVenueRow } from '@lifi/perps-sdk'
import { ONDO_PROVIDER_KEY } from '../constants.js'

/**
 * Read a venue row time as an ISO-8601 string, or `undefined` after one
 * skipped-row warning when the time is not valid.
 */
export const rowTimestampToIsoStringOrWarn = (
  row: string,
  field: string,
  value: string,
  marketId?: string
): string | undefined => {
  try {
    return timestampToIsoString(value)
  } catch {
    warnSkippedVenueRow(ONDO_PROVIDER_KEY, row, field, value, {
      marketId,
      expected: 'timestamp',
    })
    return undefined
  }
}
