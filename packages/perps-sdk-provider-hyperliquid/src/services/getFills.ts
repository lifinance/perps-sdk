import { getMarketRegistry, type SDKRequestOptions } from '@lifi/perps-sdk'
import type { Fill, FillsResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type { HlUserFills } from '../types/index.js'
import { assetIsOutcome, mapFill } from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'
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
  /** Inclusive lower bound in milliseconds; selects `userFillsByTime`. */
  startTime?: number
  /** Inclusive upper bound in milliseconds; selects `userFillsByTime`. */
  endTime?: number
}

/** Fetch retained fills newest-first, using opaque cursors across inclusive time ranges. */
export const getFills = async (
  { client, apiUrl }: HyperliquidContext,
  params: GetFillsParams,
  options?: SDKRequestOptions
): Promise<FillsResponse> => {
  const limit = getHistoryLimit(params.limit)
  const registry = getMarketRegistry(client, PROVIDER_KEY)
  await registry.sync()
  const infoOpts = hlInfoOptions(client, options)

  let useRecent =
    params.cursor === undefined &&
    params.startTime === undefined &&
    params.endTime === undefined
  const page = await historyPage(
    params,
    limit,
    async (startTime, endTime) => {
      const fills = await infoRequest<HlUserFills>(
        apiUrl,
        useRecent
          ? { type: 'userFills', user: params.address }
          : {
              type: 'userFillsByTime',
              user: params.address,
              startTime,
              endTime,
            },
        infoOpts
      )
      useRecent = false
      if (fills.length >= 2000) {
        return { items: [], saturated: true }
      }
      const items = fills.flatMap((fill): Fill[] => {
        if (assetIsOutcome(fill.coin)) {
          return []
        }
        const market = registry.get(fill.coin)
        return market === undefined ? [] : [mapFill(fill, market)]
      })
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
