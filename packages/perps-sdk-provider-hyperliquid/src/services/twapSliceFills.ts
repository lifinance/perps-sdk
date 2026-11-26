import type { Address } from 'viem'
import type { HlTwapHistoryEntry, HlTwapSliceFill } from '../types/index.js'
import type { InfoRequestOptions } from '../utils/infoClient.js'
import { fetchFillFeedSince } from './fillFeed.js'

/**
 * Read the slice fills of each `activated` TWAP in `entries`, or none without
 * a request when no entry is `activated`. `userTwapSliceFills` holds only the
 * newest rows of the account, so a full window that does not reach back to a
 * TWAP start gets its older rows from `userTwapSliceFillsByTime`.
 */
export const fetchTwapSliceFills = async (
  apiUrl: string,
  user: Address,
  entries: readonly HlTwapHistoryEntry[],
  options?: InfoRequestOptions
): Promise<HlTwapSliceFill[]> => {
  const starts = entries.flatMap((entry) =>
    entry.twapId !== undefined && entry.status.status === 'activated'
      ? [entry.state.timestamp]
      : []
  )
  if (starts.length === 0) {
    return []
  }
  return fetchFillFeedSince<HlTwapSliceFill>(
    apiUrl,
    user,
    'userTwapSliceFills',
    Math.min(...starts),
    ({ fill }) => fill,
    options
  )
}
