import {
  safeAddDecimalStrings,
  safeCalculateNotionalValue,
} from '@lifi/perps-sdk'
import type { HlTwapHistoryEntry, HlTwapSliceFill } from '../types/index.js'

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

/**
 * Take the executed size and notional of each `activated` row from the slice
 * fills of its `twapId`. The venue writes that row once, at activation. A row
 * with no slice fill, or with a slice fill that does not read, keeps its state.
 */
export const resolveTwapExecution = (
  entries: readonly HlTwapHistoryEntry[],
  sliceFills: readonly HlTwapSliceFill[]
): HlTwapHistoryEntry[] => {
  const fillsByTwap = new Map<number, HlTwapSliceFill['fill'][]>()
  for (const { twapId, fill } of sliceFills) {
    const fills = fillsByTwap.get(twapId)
    if (fills === undefined) {
      fillsByTwap.set(twapId, [fill])
    } else {
      fills.push(fill)
    }
  }
  return entries.map((entry) => {
    const fills =
      entry.status.status === 'activated' && entry.twapId !== undefined
        ? fillsByTwap.get(entry.twapId)
        : undefined
    if (fills === undefined) {
      return entry
    }
    const notionals = fills.map((fill) =>
      safeCalculateNotionalValue(fill.sz, fill.px)
    )
    if (!notionals.every((notional) => notional !== undefined)) {
      return entry
    }
    const executedSz = safeAddDecimalStrings(fills.map((fill) => fill.sz))
    const executedNtl = safeAddDecimalStrings(notionals)
    if (executedSz === undefined || executedNtl === undefined) {
      return entry
    }
    return { ...entry, state: { ...entry.state, executedSz, executedNtl } }
  })
}
