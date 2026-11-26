import {
  safeAddDecimalStrings,
  safeIsDecimalStringGreaterThan,
} from '@lifi/perps-sdk'
import type { DecimalString } from '@lifi/perps-types'
import { RETAINED_FILLS_CAP } from '../constants.js'
import type { HlUserFill } from '../types/index.js'
import type { InfoRequestOptions } from '../utils/infoClient.js'
import type { HlOrderLike } from '../utils/mapOrder.js'
import { fetchFillFeedSince } from './fillFeed.js'

/**
 * Whether `origSz − sz` of a row is no proof of a trade. Hyperliquid also
 * lowers `sz` when it shrinks a resting reduce-only order to its position.
 */
export const isFilledSizeAmbiguous = (order: HlOrderLike): boolean =>
  order.reduceOnly &&
  safeIsDecimalStringGreaterThan(order.origSz, order.sz) === true

/**
 * Sum the venue fills of each order whose filled size is ambiguous, keyed by
 * `oid`, or send no request when no order is. An order that can be older than
 * the retained fills, or that has an invalid fill size, has no entry.
 */
export const fetchTradedSizes = async (
  apiUrl: string,
  user: string,
  orders: readonly HlOrderLike[],
  options?: InfoRequestOptions
): Promise<Map<number, DecimalString>> => {
  const tradedSizes = new Map<number, DecimalString>()
  const ambiguous = orders.filter(isFilledSizeAmbiguous)
  if (ambiguous.length === 0) {
    return tradedSizes
  }
  const fills = await fetchFillFeedSince<HlUserFill>(
    apiUrl,
    user,
    'userFills',
    Math.min(...ambiguous.map((order) => order.timestamp)),
    (fill) => fill,
    options
  )
  // Below the cap, the venue discarded no fill since the oldest order.
  const retainedAfter =
    fills.length < RETAINED_FILLS_CAP
      ? -Infinity
      : Math.min(...fills.map((fill) => fill.time))
  const sizesByOrder = new Map<number, DecimalString[]>()
  for (const fill of fills) {
    const sizes = sizesByOrder.get(fill.oid)
    if (sizes === undefined) {
      sizesByOrder.set(fill.oid, [fill.sz])
    } else {
      sizes.push(fill.sz)
    }
  }
  for (const order of ambiguous) {
    if (order.timestamp <= retainedAfter) {
      continue
    }
    const tradedSize = safeAddDecimalStrings(sizesByOrder.get(order.oid) ?? [])
    if (tradedSize !== undefined) {
      tradedSizes.set(order.oid, tradedSize)
    }
  }
  return tradedSizes
}
