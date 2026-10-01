import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT } from '../constants.js'

type HistoryKey = string | number
interface HistoryBoundary {
  time: number
  key: HistoryKey
  startTime: number
  endTime: number
}

const compareKeys = (a: HistoryKey, b: HistoryKey): number =>
  typeof a === 'number' && typeof b === 'number'
    ? b - a
    : a < b
      ? 1
      : a > b
        ? -1
        : 0

export const getHistoryLimit = (limit = DEFAULT_HISTORY_LIMIT): number => {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      'Hyperliquid history limit must be a positive safe integer'
    )
  }
  return Math.min(limit, MAX_HISTORY_LIMIT)
}

const decodeCursor = (cursor: string): HistoryBoundary => {
  let value: unknown
  try {
    value = JSON.parse(cursor)
  } catch {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      'Invalid Hyperliquid history cursor'
    )
  }
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !Number.isSafeInteger(value[0]) ||
    (typeof value[1] !== 'string' && typeof value[1] !== 'number') ||
    !Number.isSafeInteger(value[2]) ||
    value[2] > value[0] ||
    !Number.isSafeInteger(value[3]) ||
    value[3] < value[0]
  ) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      'Invalid Hyperliquid history cursor'
    )
  }
  return {
    time: value[0],
    key: value[1],
    startTime: value[2],
    endTime: value[3],
  }
}

export async function historyPage<T>(
  params: { startTime?: number; endTime?: number; cursor?: string },
  limit: number,
  fetchWindow: (
    startTime: number,
    endTime: number,
    snapshotEnd: number
  ) => Promise<{ items: T[]; saturated: boolean }>,
  identify: (item: T) => { time: number; key: HistoryKey },
  signal?: AbortSignal
): Promise<{
  items: T[]
  pagination: { limit: number; hasMore: boolean; cursor?: string }
}> {
  const boundary =
    params.cursor === undefined ? undefined : decodeCursor(params.cursor)
  const lower = params.startTime ?? 0
  const snapshotEnd = boundary?.endTime ?? params.endTime ?? Date.now()
  const upper = Math.min(snapshotEnd, boundary?.time ?? Infinity)
  const windows: { startTime: number; endTime: number }[] = []
  if (boundary && boundary.startTime > lower) {
    windows.push({ startTime: lower, endTime: boundary.startTime - 1 })
  }
  windows.push({
    startTime: Math.max(lower, boundary?.startTime ?? lower),
    endTime: upper,
  })
  const items: T[] = []
  let last: HistoryBoundary | undefined
  while (windows.length > 0) {
    signal?.throwIfAborted()
    const window = windows.pop()!
    if (window.startTime > window.endTime) {
      continue
    }
    const result = await fetchWindow(
      window.startTime,
      window.endTime,
      snapshotEnd
    )
    signal?.throwIfAborted()
    if (result.saturated) {
      if (window.startTime === window.endTime) {
        throw new PerpsError(
          PerpsErrorCode.ThirdPartyError,
          'Hyperliquid history saturates a single millisecond; its time-only API cannot paginate this timestamp safely'
        )
      }
      // Time APIs truncate from the start, so a capped response cannot supply a newest page.
      const midpoint =
        window.startTime + Math.floor((window.endTime - window.startTime) / 2)
      windows.push({ startTime: window.startTime, endTime: midpoint })
      windows.push({ startTime: midpoint + 1, endTime: window.endTime })
      continue
    }
    const sorted = result.items.sort((a, b) => {
      const left = identify(a)
      const right = identify(b)
      return right.time - left.time || compareKeys(left.key, right.key)
    })
    for (const item of sorted) {
      const identity = identify(item)
      if (identity.time < window.startTime || identity.time > window.endTime) {
        continue
      }
      if (
        boundary &&
        (identity.time > boundary.time ||
          (identity.time === boundary.time &&
            compareKeys(identity.key, boundary.key) <= 0))
      ) {
        continue
      }
      if (items.length === limit) {
        return {
          items,
          pagination: {
            limit,
            hasMore: true,
            cursor:
              last &&
              JSON.stringify([
                last.time,
                last.key,
                last.startTime,
                last.endTime,
              ]),
          },
        }
      }
      items.push(item)
      last = { ...identity, startTime: window.startTime, endTime: snapshotEnd }
    }
  }
  return {
    items,
    pagination: {
      limit,
      hasMore: false,
      cursor:
        last &&
        JSON.stringify([last.time, last.key, last.startTime, last.endTime]),
    },
  }
}
