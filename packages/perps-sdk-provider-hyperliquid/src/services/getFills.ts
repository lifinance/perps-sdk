import type { FillsResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  PROVIDER_KEY,
} from '../constants.js'
import type { HlUserFills, HlUserFillsByTime } from '../types/index.js'
import { enrichAsset, type HlAssetContext } from '../utils/assetContext.js'
import { mapFill } from '../utils/index.js'
import { type InfoRequestOptions, infoRequest } from '../utils/infoClient.js'

export interface GetFillsParams {
  address: Address
  limit?: number
  /** `tid` of the oldest fill to return (returned items have `tid < cursor`). */
  cursor?: string
  /** Inclusive lower bound in ms-since-epoch — switches to the `userFillsByTime` endpoint. */
  startTime?: number
  /** Inclusive upper bound in ms-since-epoch — switches to the `userFillsByTime` endpoint. */
  endTime?: number
}

/**
 * Fetch the user's fills history. When `startTime` or `endTime` is provided,
 * Hyperliquid's `userFillsByTime` endpoint is used; otherwise the unbounded
 * `userFills` endpoint returns the full history. Market metadata (`ctx`) is
 * sourced backend-side; only the fills endpoint is read direct from HL.
 *
 * Pagination is cursor-based on the fill's `tid`: results with
 * `tid < cursor` are kept and the last-page's tail `id` is returned as the
 * next cursor.
 */
export const getFills = async (
  apiUrl: string,
  params: GetFillsParams,
  ctx: HlAssetContext,
  options?: InfoRequestOptions
): Promise<FillsResponse> => {
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
        options
      )
    : await infoRequest<HlUserFills>(
        apiUrl,
        { type: 'userFills', user: params.address },
        options
      )

  const filtered =
    params.cursor === undefined
      ? allFills
      : allFills.filter((f) => f.tid < Number.parseInt(params.cursor!, 10))

  const hasMore = filtered.length > limit
  const items = filtered.slice(0, limit).map((f) => {
    const fill = mapFill(f)
    return { ...fill, asset: enrichAsset(fill.asset.assetId, ctx) }
  })

  return {
    provider: PROVIDER_KEY,
    items,
    pagination: {
      limit,
      hasMore,
      cursor: items.length > 0 ? items[items.length - 1].id : undefined,
    },
  }
}
