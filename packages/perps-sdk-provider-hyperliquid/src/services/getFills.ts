import { getMarketRegistry, type SDKRequestOptions } from '@lifi/perps-sdk'
import type { Fill, FillsResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import { FILL_ROWS_CAP, PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type { HlTwapSliceFill, HlUserFills } from '../types/index.js'
import { assetIsOutcome, mapFill } from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'
import { requireAccountExists } from './getAccountExists.js'
import { getHistoryLimit, historyPage } from './historyPagination.js'

/**
 * Parameters for {@link getFills}.
 *
 * @public
 */
export interface GetFillsParams {
  address: Address
  /** Positive safe integer; defaults to 50 and is capped at 200. */
  limit?: number
  /** Opaque cursor returned in the previous page's `pagination.cursor`. */
  cursor?: string
  /** Inclusive lower bound in milliseconds; selects the `...ByTime` feeds. */
  startTime?: number
  /** Inclusive upper bound in milliseconds; selects the `...ByTime` feeds. */
  endTime?: number
}

/**
 * Fetch retained regular and TWAP slice fills newest-first, using opaque
 * cursors across inclusive time ranges.
 */
export const getFills = async (
  { client, apiUrl }: HyperliquidContext,
  params: GetFillsParams,
  options?: SDKRequestOptions
): Promise<FillsResponse> => {
  const limit = getHistoryLimit(params.limit)
  const infoOpts = hlInfoOptions(client, options)
  await requireAccountExists(apiUrl, params.address, infoOpts)
  const registry = getMarketRegistry(client, PROVIDER_KEY)
  await registry.sync()

  let useRecent =
    params.cursor === undefined &&
    params.startTime === undefined &&
    params.endTime === undefined
  const page = await historyPage(
    params,
    limit,
    async (startTime, endTime) => {
      const user = params.address
      const [fills, sliceFills] = await Promise.all([
        infoRequest<HlUserFills>(
          apiUrl,
          useRecent
            ? { type: 'userFills', user }
            : { type: 'userFillsByTime', user, startTime, endTime },
          infoOpts
        ),
        infoRequest<HlTwapSliceFill[]>(
          apiUrl,
          useRecent
            ? { type: 'userTwapSliceFills', user }
            : { type: 'userTwapSliceFillsByTime', user, startTime, endTime },
          infoOpts
        ),
      ])
      useRecent = false
      if (fills.length >= FILL_ROWS_CAP || sliceFills.length >= FILL_ROWS_CAP) {
        return { items: [], saturated: true }
      }
      const seen = new Set<number>()
      const items = [...fills, ...sliceFills.map(({ fill }) => fill)].flatMap(
        (fill): Fill[] => {
          if (assetIsOutcome(fill.coin) || seen.has(fill.tid)) {
            return []
          }
          seen.add(fill.tid)
          const market = registry.get(fill.coin)
          const mapped = market && mapFill(fill, market, params.address)
          return mapped ? [mapped] : []
        }
      )
      return { items, saturated: false }
    },
    (fill) => ({
      time: new Date(fill.createdAt).getTime(),
      key: Number(fill.id),
    }),
    options?.signal
  )
  return { provider: PROVIDER_KEY, ...page }
}
