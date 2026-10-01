import {
  type AssetRegistry,
  getAssetRegistry,
  getMarketRegistry,
  PerpsError,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import type {
  ActivitiesResponse,
  ActivityItem,
  FundingActivity,
  MarketDisplay,
} from '@lifi/perps-types'
import { ActivityType, PerpsErrorCode } from '@lifi/perps-types'
import type { Address } from 'viem'
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  PROVIDER_KEY,
} from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type {
  HlUserFills,
  HlUserFunding,
  HlUserNonFundingLedgerUpdates,
} from '../types/index.js'
import {
  isBorrowLendDelta,
  isCollateralTransferDelta,
  isCStakingTransferDelta,
  isDepositDelta,
  isLiquidationDelta,
  isSendAssetDelta,
  isSpotTransferDelta,
  isVaultTransferDelta,
  isWithdrawDelta,
} from '../types/index.js'
import {
  mapFundingActivity,
  mapLedgerEntry,
  mapLiquidationFills,
} from '../utils/index.js'
import {
  hlInfoOptions,
  type InfoRequestOptions,
  infoRequest,
} from '../utils/infoClient.js'
import { historyPage } from './historyPagination.js'

/**
 * Parameters for {@link getActivity}.
 *
 * @public
 */
export interface GetActivityParams {
  address: Address
  /** Maximum items returned; defaults to 50 and is capped at 200. */
  limit?: number
  /** Opaque cursor returned in the previous page's `pagination.cursor`. */
  cursor?: string
  /** Inclusive lower bound in milliseconds since epoch. */
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

const ASSET_BEARING_TYPES: ReadonlySet<ActivityType> = new Set([
  ActivityType.DEPOSIT,
  ActivityType.WITHDRAWAL,
  ActivityType.TRANSFER,
])

const needsMarkets = (typeFilter: ActivityType[] | undefined): boolean =>
  !typeFilter || typeFilter.some((t) => MARKET_BEARING_TYPES.has(t))

const fetchLiquidationHistory = async (
  apiUrl: string,
  user: Address,
  startTime: number,
  endTime: number,
  resolveMarket: (coin: string) => MarketDisplay | undefined,
  options?: InfoRequestOptions
): Promise<ActivityItem[]> => {
  const retained = new Map<number, HlUserFills[number]>()
  while (startTime <= endTime) {
    options?.signal?.throwIfAborted()
    const fills = await infoRequest<HlUserFills>(
      apiUrl,
      { type: 'userFillsByTime', user, startTime, endTime },
      options
    )
    options?.signal?.throwIfAborted()
    let latest = startTime
    for (const fill of fills) {
      retained.set(fill.tid, fill)
      latest = Math.max(latest, fill.time)
    }
    if (fills.length < 2000 || retained.size >= 10000) {
      break
    }
    if (latest === startTime) {
      throw new PerpsError(
        PerpsErrorCode.ThirdPartyError,
        'Hyperliquid fills saturate a single millisecond; liquidation history cannot be paginated safely'
      )
    }
    // Inclusive overlap retains all same-time fills at the venue page boundary.
    startTime = latest
  }
  const queried = user.toLowerCase()
  const fills = [...retained.values()].filter(
    (fill) => fill.liquidation?.liquidatedUser.toLowerCase() === queried
  )
  if (fills.length === 0) {
    return []
  }
  const hashes = new Set<string>()
  let firstTime = Infinity
  let lastTime = 0
  for (const fill of fills) {
    if (fill.hash !== undefined) {
      hashes.add(fill.hash)
    }
    firstTime = Math.min(firstTime, fill.time)
    lastTime = Math.max(lastTime, fill.time)
  }
  // Exclusions must cover the entire order, not the current SDK page's ledger window.
  const ledger = await historyPage(
    { startTime: firstTime, endTime: lastTime },
    Number.MAX_SAFE_INTEGER,
    async (startTime, endTime) => {
      const updates = await infoRequest<HlUserNonFundingLedgerUpdates>(
        apiUrl,
        { type: 'userNonFundingLedgerUpdates', user, startTime, endTime },
        options
      )
      return {
        items: updates.filter(
          (entry) => isLiquidationDelta(entry.delta) && hashes.has(entry.hash)
        ),
        saturated: updates.length >= 500,
      }
    },
    (entry) => ({ time: entry.time, key: entry.hash }),
    options?.signal
  )
  return mapLiquidationFills(
    fills,
    PROVIDER_KEY,
    user,
    resolveMarket,
    new Set(ledger.items.map((entry) => entry.hash))
  )
}

const fetchActivityData = async (
  apiUrl: string,
  typeFilter: ActivityType[] | undefined,
  timeParams: { user: Address; startTime: number; endTime: number },
  assetRegistry: AssetRegistry,
  resolveMarket: (coin: string) => MarketDisplay | undefined,
  liquidationHistory: Promise<ActivityItem[]> | undefined,
  options?: InfoRequestOptions
): Promise<{ items: ActivityItem[]; saturated: boolean }> => {
  const needLedger =
    !typeFilter || typeFilter.some((t) => t !== ActivityType.FUNDING)
  const needFunding = !typeFilter || typeFilter.includes(ActivityType.FUNDING)

  const [ledgerUpdates, fundingUpdates, liquidations] = await Promise.all([
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
    liquidationHistory,
  ])
  if (ledgerUpdates.length >= 500 || fundingUpdates.length >= 500) {
    return { items: [], saturated: true }
  }

  const ledgerItems: ActivityItem[] = ledgerUpdates.flatMap(
    (entry): ActivityItem[] => {
      if (
        typeFilter !== undefined &&
        ((isDepositDelta(entry.delta) &&
          !typeFilter.includes(ActivityType.DEPOSIT)) ||
          (isWithdrawDelta(entry.delta) &&
            !typeFilter.includes(ActivityType.WITHDRAWAL)) ||
          (!typeFilter.includes(ActivityType.TRANSFER) &&
            (isSpotTransferDelta(entry.delta) ||
              isSendAssetDelta(entry.delta) ||
              isCollateralTransferDelta(entry.delta) ||
              isVaultTransferDelta(entry.delta) ||
              isCStakingTransferDelta(entry.delta) ||
              isBorrowLendDelta(entry.delta))))
      ) {
        return []
      }
      const item = mapLedgerEntry(
        entry,
        PROVIDER_KEY,
        timeParams.user,
        assetRegistry,
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

  const merged = [...ledgerItems, ...fundingItems, ...(liquidations ?? [])]
  const items = typeFilter
    ? merged.filter((item) => typeFilter.includes(item.type))
    : merged
  return { items, saturated: false }
}

/** Fetch retained activity newest-first with opaque cursors across inclusive time ranges. */
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
  const assetRegistry = getAssetRegistry(client, PROVIDER_KEY)
  if (
    params.type === undefined ||
    params.type.some((type) => ASSET_BEARING_TYPES.has(type))
  ) {
    await assetRegistry.sync()
  }
  const infoOpts = hlInfoOptions(client, options)

  const limit = Math.min(
    params.limit ?? DEFAULT_HISTORY_LIMIT,
    MAX_HISTORY_LIMIT
  )
  const needLiquidationFills =
    !params.type || params.type.includes(ActivityType.LIQUIDATION)
  let liquidationHistory: Promise<ActivityItem[]> | undefined
  const page = await historyPage(
    params,
    limit,
    (startTime, endTime, snapshotEnd) => {
      if (needLiquidationFills && liquidationHistory === undefined) {
        liquidationHistory = fetchLiquidationHistory(
          apiUrl,
          params.address,
          params.startTime ?? 0,
          snapshotEnd,
          (coin) => registry.get(coin),
          infoOpts
        )
      }
      return fetchActivityData(
        apiUrl,
        params.type,
        { user: params.address, startTime, endTime },
        assetRegistry,
        (coin) => registry.get(coin),
        liquidationHistory,
        infoOpts
      )
    },
    (item) => ({
      time: new Date(item.timestamp).getTime(),
      key: `${item.type}:${item.id}`,
    }),
    options?.signal
  )
  return { provider: PROVIDER_KEY, ...page }
}
