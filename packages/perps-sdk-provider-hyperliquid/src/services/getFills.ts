import { getMarketRegistry, type SDKRequestOptions } from '@lifi/perps-sdk'
import type { Fill, FillsResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  PROVIDER_KEY,
} from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type {
  HlUserFill,
  HlUserFills,
  HlUserFillsByTime,
} from '../types/index.js'
import { mapFill } from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

/**
 * Parameters for {@link getFills}.
 *
 * @public
 */
export interface GetFillsParams {
  address: Address
  /** Maximum items returned; defaults to 50 and is capped at 200. */
  limit?: number
  /** Opaque cursor returned in the previous page's `pagination.cursor`. */
  cursor?: string
  /** Inclusive lower bound in milliseconds; selects `userFillsByTime`. */
  startTime?: number
  /** Inclusive upper bound in milliseconds; selects `userFillsByTime`. */
  endTime?: number
}

interface FillCursor {
  time: number
  tid: number
}

// HL's docs specify neither newest-first ordering nor monotonic `tid` for
// `userFills`/`userFillsByTime`, so pagination can't rely on upstream order —
// it must impose its own (time desc, tid desc as tiebreaker for same-time fills).
const compareFillsDesc = (a: FillCursor, b: FillCursor): number =>
  b.time - a.time || b.tid - a.tid

const encodeCursor = (fill: FillCursor): string => `${fill.time}:${fill.tid}`

const decodeCursor = (cursor: string): FillCursor => {
  const [time, tid] = cursor.split(':').map(Number)
  return { time, tid }
}

/**
 * Fetch the user's fills history. When `startTime` or `endTime` is provided,
 * Hyperliquid's `userFillsByTime` endpoint is used; otherwise the unbounded
 * `userFills` endpoint returns the full history. The backend's enriched asset
 * list supplies the display fields; only the fills endpoint is read direct
 * from HL.
 *
 * The response is sorted (time desc, `tid` as tiebreaker) before pagination —
 * see {@link compareFillsDesc}. The cursor encodes the last returned fill's
 * `(time, tid)`; the next page keeps fills that sort strictly after it.
 * @throws {PerpsError} On Hyperliquid REST error, network, or parsing failures.
 * @public
 */
export const getFills = async (
  { client, apiUrl }: HyperliquidContext,
  params: GetFillsParams,
  options?: SDKRequestOptions
): Promise<FillsResponse> => {
  const registry = getMarketRegistry(client, PROVIDER_KEY)
  await registry.sync()
  const infoOpts = hlInfoOptions(client, options)

  const limit = Math.min(
    params.limit ?? DEFAULT_HISTORY_LIMIT,
    MAX_HISTORY_LIMIT
  )

  const useByTime =
    params.startTime !== undefined || params.endTime !== undefined

  const allFills = useByTime
    ? await infoRequest<HlUserFillsByTime>(
        apiUrl,
        {
          type: 'userFillsByTime',
          user: params.address,
          startTime: params.startTime ?? 0,
          ...(params.endTime !== undefined ? { endTime: params.endTime } : {}),
        },
        infoOpts
      )
    : await infoRequest<HlUserFills>(
        apiUrl,
        { type: 'userFills', user: params.address },
        infoOpts
      )

  const sorted = [...allFills].sort(compareFillsDesc)

  const filtered =
    params.cursor === undefined
      ? sorted
      : sorted.filter(
          (f) => compareFillsDesc(f, decodeCursor(params.cursor!)) > 0
        )

  const hasMore = filtered.length > limit
  const page = filtered.slice(0, limit)
  // `get`, not `require`: a coin the backend market list does not hold drops
  // only its own row instead of rejecting the whole page. The registry warns
  // once per unresolved id. A delisted market still resolves, so its rows stay.
  const items = page.flatMap((f): Fill[] => {
    const market = registry.get(f.coin)
    return market === undefined ? [] : [mapFill(f, market)]
  })
  const lastPageFill: HlUserFill | undefined = page[page.length - 1]

  return {
    provider: PROVIDER_KEY,
    items,
    pagination: {
      limit,
      hasMore,
      cursor: lastPageFill ? encodeCursor(lastPageFill) : undefined,
    },
  }
}
