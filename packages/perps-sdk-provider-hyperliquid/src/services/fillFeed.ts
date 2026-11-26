import { FILL_ROWS_CAP } from '../constants.js'
import type { HlUserFill } from '../types/index.js'
import { type InfoRequestOptions, infoRequest } from '../utils/infoClient.js'
import { historyPage } from './historyPagination.js'

/**
 * Read the rows of a fill feed from `startTime` on. The recent feed holds only
 * the newest rows of the account, so a full window that does not reach back to
 * `startTime` gets its older rows from the `...ByTime` feed.
 */
export const fetchFillFeedSince = async <T>(
  apiUrl: string,
  user: string,
  feed: 'userFills' | 'userTwapSliceFills',
  startTime: number,
  fillOf: (row: T) => HlUserFill,
  options?: InfoRequestOptions
): Promise<T[]> => {
  const window = await infoRequest<T[]>(apiUrl, { type: feed, user }, options)
  if (window.length < FILL_ROWS_CAP) {
    return window
  }
  const oldest = Math.min(...window.map((row) => fillOf(row).time))
  if (startTime > oldest) {
    return window
  }
  // The window can end inside its oldest millisecond, so read that millisecond again.
  const older = await historyPage(
    { startTime, endTime: oldest },
    Number.MAX_SAFE_INTEGER,
    async (rangeStart, rangeEnd) => {
      const rows = await infoRequest<T[]>(
        apiUrl,
        {
          type: `${feed}ByTime`,
          user,
          startTime: rangeStart,
          endTime: rangeEnd,
        },
        options
      )
      return rows.length >= FILL_ROWS_CAP
        ? { items: [], saturated: true }
        : { items: rows, saturated: false }
    },
    (row) => ({ time: fillOf(row).time, key: fillOf(row).tid }),
    options?.signal
  )
  return [...window.filter((row) => fillOf(row).time > oldest), ...older.items]
}
