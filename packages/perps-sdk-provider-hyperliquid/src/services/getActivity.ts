import { getMarketRegistry, type SDKRequestOptions } from '@lifi/perps-sdk'
import type {
  ActivitiesResponse,
  ActivityItem,
  FundingActivity,
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
  /** Maximum items returned; defaults to 50 and is capped at 200. */
  limit?: number
  /** Millisecond timestamp cursor; rows strictly older than it are returned. */
  cursor?: string
  /** Inclusive lower bound in milliseconds since epoch; defaults to 90 days ago. */
  startTime?: number
  /** Inclusive upper bound in milliseconds since epoch. */
  endTime?: number
  /** Optional normalized activity-type filter applied after mapping. */
  type?: ActivityType[]
}

const MARKET_BEARING_TYPES: ReadonlySet<ActivityType> = new Set([
  ActivityType.FUNDING,
  ActivityType.LIQUIDATION,
])

const needsMarkets = (typeFilter: ActivityType[] | undefined): boolean =>
  !typeFilter || typeFilter.some((t) => MARKET_BEARING_TYPES.has(t))

const fetchActivityData = async (
  apiUrl: string,
  typeFilter: ActivityType[] | undefined,
  timeParams: { user: Address; startTime: number; endTime?: number },
  resolveMarket: (coin: string) => MarketDisplay | undefined,
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

  const ledgerItems: ActivityItem[] = ledgerUpdates.flatMap(
    (entry): ActivityItem[] => {
      const item = mapLedgerEntry(
        entry,
        PROVIDER_KEY,
        timeParams.user,
        resolveMarket
      )
      return item === null ? [] : [item]
    }
  )

  const fundingItems: ActivityItem[] = fundingUpdates.flatMap(
    (entry): FundingActivity[] => {
      const item = mapFundingActivity(entry, PROVIDER_KEY, resolveMarket)
      return item === null ? [] : [item]
    }
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
  // Only funding and liquidation rows carry a market, so a Ledger-only
  // request must not pull the market list.
  if (needsMarkets(params.type)) {
    await registry.sync()
  }
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

  // `get`, not `require`: a coin the backend market list does not hold drops
  // only its own row instead of rejecting the whole feed. The registry warns
  // once per unresolved id. A delisted market still resolves, so its rows stay.
  const merged = await fetchActivityData(
    apiUrl,
    params.type,
    timeParams,
    (coin) => registry.get(coin),
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
