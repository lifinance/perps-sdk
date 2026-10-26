import type { HlTwapHistoryEntry } from '../types/index.js'

/**
 * Keep the newest `twapHistory` row of each TWAP, in first-seen id order. The
 * venue adds one row per status change; on equal `time` the earlier row wins.
 */
export const resolveLatestTwapEntries = (
  history: readonly HlTwapHistoryEntry[]
): HlTwapHistoryEntry[] => {
  const latest = new Map<number | undefined, HlTwapHistoryEntry>()
  for (const entry of history) {
    const kept = latest.get(entry.twapId)
    if (kept === undefined || entry.time > kept.time) {
      latest.set(entry.twapId, entry)
    }
  }
  return [...latest.values()]
}
