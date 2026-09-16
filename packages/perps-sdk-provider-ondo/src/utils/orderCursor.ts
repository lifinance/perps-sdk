import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { OndoTwapOrder } from '../types/wire.js'

export const ORDER_SOURCES = [
  'open',
  'canceled',
  'fullyfilled',
  'twaps',
  'history',
] as const
export type OrderSource = (typeof ORDER_SOURCES)[number]
export interface OrderPageCursor {
  cursor?: string
  offset: number
  limit?: number
}
export type OndoOrderCursor = Partial<
  Record<Exclude<OrderSource, 'twaps'>, OrderPageCursor>
> & { twaps?: OndoTwapOrder[] }

/** Keep each order endpoint's cursor independent, including partial-page offsets. */
export const encodeOrderCursor = (
  cursor: OndoOrderCursor
): string | undefined =>
  Object.keys(cursor).length === 0 ? undefined : JSON.stringify(cursor)

const isTwapSnapshot = (value: unknown): value is OndoTwapOrder[] =>
  Array.isArray(value) &&
  value.every(
    (row: unknown) =>
      row !== null &&
      typeof row === 'object' &&
      'twapId' in row &&
      typeof row.twapId === 'string' &&
      'market' in row &&
      typeof row.market === 'string' &&
      'side' in row &&
      (row.side === 'buy' || row.side === 'sell') &&
      'startTime' in row &&
      typeof row.startTime === 'string' &&
      'runningTime' in row &&
      typeof row.runningTime === 'number' &&
      'frequency' in row &&
      typeof row.frequency === 'number' &&
      'avgFilledPrice' in row &&
      typeof row.avgFilledPrice === 'string' &&
      'filledSize' in row &&
      typeof row.filledSize === 'string' &&
      'totalSize' in row &&
      typeof row.totalSize === 'string' &&
      'totalFees' in row &&
      typeof row.totalFees === 'string' &&
      'orderStatus' in row &&
      typeof row.orderStatus === 'string' &&
      'reduceOnly' in row &&
      typeof row.reduceOnly === 'boolean' &&
      (!('finishTime' in row) || typeof row.finishTime === 'string') &&
      (!('maxPrice' in row) || typeof row.maxPrice === 'string') &&
      (!('minPrice' in row) || typeof row.minPrice === 'string') &&
      (!('successfulOrders' in row) ||
        typeof row.successfulOrders === 'number') &&
      (!('failedOrders' in row) || typeof row.failedOrders === 'number') &&
      (!('twapCancelReason' in row) ||
        row.twapCancelReason === 0 ||
        row.twapCancelReason === 1 ||
        row.twapCancelReason === 2) &&
      (!('lastChildOrderError' in row) ||
        typeof row.lastChildOrderError === 'string')
  )

/** Reject malformed cursors instead of silently replaying the first order page. */
export const decodeOrderCursor = (
  cursor: string | undefined
): OndoOrderCursor | undefined => {
  if (cursor === undefined) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(cursor)
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error('Expected endpoint cursor object')
    }
    const result: OndoOrderCursor = {}
    for (const [key, value] of Object.entries(parsed)) {
      const source = ORDER_SOURCES.find((candidate) => candidate === key)
      if (source === 'twaps') {
        if (!isTwapSnapshot(value)) {
          throw new Error('Invalid running TWAP snapshot')
        }
        result.twaps = value
        continue
      }
      if (
        source === undefined ||
        value === null ||
        typeof value !== 'object' ||
        !('offset' in value) ||
        typeof value.offset !== 'number' ||
        !Number.isSafeInteger(value.offset) ||
        value.offset < 0 ||
        ('cursor' in value && typeof value.cursor !== 'string') ||
        ('limit' in value &&
          (typeof value.limit !== 'number' ||
            !Number.isSafeInteger(value.limit) ||
            value.limit <= 0))
      ) {
        throw new Error('Invalid endpoint cursor')
      }
      result[source] = {
        offset: value.offset,
        ...('cursor' in value ? { cursor: value.cursor } : {}),
        ...('limit' in value ? { limit: value.limit } : {}),
      }
    }
    return result
  } catch {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      'Invalid Ondo order cursor'
    )
  }
}
