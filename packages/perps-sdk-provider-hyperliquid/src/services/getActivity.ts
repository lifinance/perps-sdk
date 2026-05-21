import type {
  ActivitiesResponse,
  ActivityItem,
  Address,
  AssetDisplay,
  FundingActivity,
  LiquidationActivity,
} from '@lifi/perps-types'
import { ActivityType } from '@lifi/perps-types'
import {
  type HlUserFunding,
  type HlUserNonFundingLedgerUpdates,
  mapFundingActivity,
  mapLedgerEntry,
} from '@lifi/perps-types/providers/hyperliquid'
import {
  type AssetEnrichmentMaps,
  buildAssetEnrichmentMaps,
  resolveDisplayQuote,
  resolveDisplaySymbol,
} from '../assetLookups.js'
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  NINETY_DAYS_MS,
  PROVIDER_KEY,
} from '../constants.js'
import { type InfoRequestOptions, infoRequest } from '../infoClient.js'

export interface GetActivityParams {
  address: Address
  limit?: number
  /** `cursor` is a ms-since-epoch upper bound — items with `timestamp < cursor` are returned. */
  cursor?: string
  startTime?: number
  endTime?: number
  type?: ActivityType[]
}

const enrichAssetDisplay = (
  assetId: string,
  maps: AssetEnrichmentMaps
): AssetDisplay => ({
  assetId,
  market: maps.assetMarketMap.get(assetId) ?? '',
  displaySymbol: resolveDisplaySymbol(assetId, maps),
  displayQuote: resolveDisplayQuote(assetId, maps),
})

const enrichActivityItem = (
  item: ActivityItem,
  maps: AssetEnrichmentMaps
): ActivityItem => {
  if (item.type === ActivityType.FUNDING) {
    const funding = item as FundingActivity
    return {
      ...funding,
      asset: enrichAssetDisplay(funding.asset.assetId, maps),
    }
  }
  if (item.type === ActivityType.LIQUIDATION) {
    const liq = item as LiquidationActivity
    return {
      ...liq,
      liquidatedPositions: liq.liquidatedPositions.map((p) => ({
        ...p,
        asset: enrichAssetDisplay(p.asset.assetId, maps),
      })),
    }
  }
  return item
}

const fetchActivityData = async (
  apiUrl: string,
  typeFilter: ActivityType[] | undefined,
  timeParams: { user: Address; startTime: number; endTime?: number },
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
    .map((entry) => mapLedgerEntry(entry, PROVIDER_KEY, timeParams.user))
    .filter((item): item is ActivityItem => item !== null)

  const fundingItems: ActivityItem[] = fundingUpdates.map((entry) =>
    mapFundingActivity(entry, PROVIDER_KEY)
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
 */
export const getActivity = async (
  apiUrl: string,
  params: GetActivityParams,
  options?: InfoRequestOptions
): Promise<ActivitiesResponse> => {
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

  const [merged, enrichmentMaps] = await Promise.all([
    fetchActivityData(apiUrl, params.type, timeParams, options),
    buildAssetEnrichmentMaps(apiUrl, options),
  ])

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
  const items = filtered
    .slice(0, limit)
    .map((item) => enrichActivityItem(item, enrichmentMaps))

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
