import type { Address } from 'viem'
import type { HlTwapHistoryEntry, HlTwapSliceFill } from '../types/index.js'
import { type InfoRequestOptions, infoRequest } from '../utils/infoClient.js'
import { historyPage } from './historyPagination.js'

/** Row cap of both `userTwapSliceFills` and `userTwapSliceFillsByTime`. */
const TWAP_SLICE_FILLS_CAP = 2000

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
  const window = await infoRequest<HlTwapSliceFill[]>(
    apiUrl,
    { type: 'userTwapSliceFills', user },
    options
  )
  if (window.length < TWAP_SLICE_FILLS_CAP) {
    return window
  }
  const oldest = Math.min(...window.map(({ fill }) => fill.time))
  const startTime = Math.min(...starts)
  if (startTime > oldest) {
    return window
  }
  // The window can end inside its oldest millisecond, so read that millisecond again.
  const older = await historyPage(
    { startTime, endTime: oldest },
    Number.MAX_SAFE_INTEGER,
    async (rangeStart, rangeEnd) => {
      const fills = await infoRequest<HlTwapSliceFill[]>(
        apiUrl,
        {
          type: 'userTwapSliceFillsByTime',
          user,
          startTime: rangeStart,
          endTime: rangeEnd,
        },
        options
      )
      return fills.length >= TWAP_SLICE_FILLS_CAP
        ? { items: [], saturated: true }
        : { items: fills, saturated: false }
    },
    ({ fill }) => ({ time: fill.time, key: fill.tid }),
    options?.signal
  )
  return [...window.filter(({ fill }) => fill.time > oldest), ...older.items]
}
