import { getMarketRegistry, type SDKRequestOptions } from '@lifi/perps-sdk'
import type {
  ActivitiesResponse,
  ActivityItem,
  MarketDisplay,
} from '@lifi/perps-types'
import { ActivityType } from '@lifi/perps-types'
import type { Address } from 'viem'
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  NINETY_DAYS_MS,
  PROVIDER_KEY,
} from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type {
  HlUserFunding,
  HlUserNonFundingLedgerUpdates,
} from '../types/index.js'
import { mapFundingActivity, mapLedgerEntry } from '../utils/index.js'
import {
  hlInfoOptions,
  type InfoRequestOptions,
  infoRequest,
} from '../utils/infoClient.js'

/**
 * Parameters for {@link getActivity}.
 *
 * @public
 */
export interface GetActivityParams {
  address: Address
  limit?: number
  /** `cursor` is a ms-since-epoch upper bound — items with `timestamp < cursor` are returned. */
  cursor?: string
  startTime?: number
  endTime?: number
  type?: ActivityType[]
}

const fetchActivityData = async (
  apiUrl: string,
  typeFilter: ActivityType[] | undefined,
  timeParams: { user: Address; startTime: number; endTime?: number },
  resolveMarket: (coin: string) => MarketDisplay,
  options?: InfoRequestOptions
): Promise<ActivityItem[]> => {
  const needLedger =
    !typeFilter || typeFilter.some((t) => t !== ActivityType.FUNDING)
  const needFunding = !typeFilter || typeFilter.includes(ActivityType.FUNDING)

  const [ledgerUpdates, fundingUpdates] = await Promise.all([
    needLedger
      ? infoRequest<HlUserNonFundingLedgerUpdates>(
          apiUrl,
          { type: 'userNonFundingLedgerUpdates', ...timeParams },
          options
        )
      : Promise.resolve([] as HlUserNonFundingLedgerUpdates),
    needFunding
      ? infoRequest<HlUserFunding>(
          apiUrl,
          { type: 'userFunding', ...timeParams },
          options
        )
      : Promise.resolve([] as HlUserFunding),
  ])

  const ledgerItems: ActivityItem[] = ledgerUpdates
    .map((entry) =>
      mapLedgerEntry(entry, PROVIDER_KEY, timeParams.user, resolveMarket)
    )
    .filter((item): item is ActivityItem => item !== null)

  const fundingItems: ActivityItem[] = fundingUpdates.map((entry) =>
    mapFundingActivity(entry, PROVIDER_KEY, resolveMarket)
  )

  const merged = [...ledgerItems, ...fundingItems].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  if (!typeFilter) {
    return merged
  }
  const typeSet = new Set(typeFilter)
  return merged.filter((item) => typeSet.has(item.type))
}

/**
 * Fetch a chronological activity feed (deposits, withdrawals, transfers,
 * liquidations, funding) for `address`. Combines results from Hyperliquid's
 * `userNonFundingLedgerUpdates` and `userFunding` endpoints, sorted
 * newest-first.
 *
 * Cursor-based pagination uses the ms-since-epoch timestamp of the last
 * item on the current page. `startTime` defaults to 90 days ago to keep
 * unbounded queries cheap.
 * @throws {PerpsError} On Hyperliquid REST error, network, or parsing failures.
 * @public
 */
export const getActivity = async (
  { client, apiUrl }: HyperliquidContext,
  params: GetActivityParams,
  options?: SDKRequestOptions
): Promise<ActivitiesResponse> => {
  const registry = getMarketRegistry(client, PROVIDER_KEY)
  await registry.sync()
  const infoOpts = hlInfoOptions(client, options)

  const limit = Math.min(
    params.limit ?? DEFAULT_HISTORY_LIMIT,
    MAX_HISTORY_LIMIT
  )
  const startTime = params.startTime ?? Date.now() - NINETY_DAYS_MS
  const endTime =
    params.cursor === undefined
      ? params.endTime
      : Number.parseInt(params.cursor, 10)

  const timeParams = {
    user: params.address,
    startTime,
    ...(endTime === undefined ? {} : { endTime }),
  }

  const merged = await fetchActivityData(
    apiUrl,
    params.type,
    timeParams,
    (coin) => registry.require(coin),
    infoOpts
  )

  // Hyperliquid's endTime is inclusive — drop boundary items so we don't
  // return the cursor row twice on the next page.
  const filtered =
    params.cursor === undefined
      ? merged
      : merged.filter(
          (item) =>
            new Date(item.timestamp).getTime() <
            Number.parseInt(params.cursor!, 10)
        )

  const hasMore = filtered.length > limit
  const items = filtered.slice(0, limit)

  return {
    provider: PROVIDER_KEY,
    items,
    pagination: {
      limit,
      hasMore,
      cursor:
        items.length > 0
          ? String(new Date(items[items.length - 1].timestamp).getTime())
          : undefined,
    },
  }
}
