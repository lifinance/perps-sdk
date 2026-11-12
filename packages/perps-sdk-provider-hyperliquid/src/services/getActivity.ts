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
import { PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type { HlUserFills, HlUserFunding } from '../types/index.js'
import {
  isAccountActivationGasDelta,
  isBorrowLendDelta,
  isCollateralTransferDelta,
  isCStakingTransferDelta,
  isDepositDelta,
  isGossipPriorityGasAuctionDelta,
  isLiquidationDelta,
  isRewardsClaimDelta,
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
import { isFillLiquidatingAccount } from '../utils/isFillLiquidatingAccount.js'
import { requireAccountExists } from './getAccountExists.js'
import { getLedgerHistory, getLedgerWindow } from './getLedgerHistory.js'
import { getHistoryLimit, historyPage } from './historyPagination.js'

/**
 * Parameters for {@link getActivity}.
 *
 * @public
 */
export interface GetActivityParams {
  address: Address
  /** Positive safe integer; defaults to 50 and is capped at 200. */
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
  ActivityType.FEE,
  ActivityType.REWARD,
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
  const fills = [...retained.values()].filter((fill) =>
    isFillLiquidatingAccount(fill, user)
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
  const ledger = await getLedgerHistory(
    apiUrl,
    { user, startTime: firstTime, endTime: lastTime },
    options
  )
  return mapLiquidationFills(
    fills,
    PROVIDER_KEY,
    user,
    resolveMarket,
    new Set(
      ledger
        .filter(
          (entry) => isLiquidationDelta(entry.delta) && hashes.has(entry.hash)
        )
        .map((entry) => entry.hash)
    )
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

  const [ledgerWindow, fundingUpdates, liquidations] = await Promise.all([
    needLedger
      ? getLedgerWindow(apiUrl, timeParams, options)
      : Promise.resolve({ items: [], saturated: false }),
    needFunding
      ? infoRequest<HlUserFunding>(
          apiUrl,
          { type: 'userFunding', ...timeParams },
          options
        )
      : Promise.resolve([] as HlUserFunding),
    liquidationHistory,
  ])
  if (ledgerWindow.saturated || fundingUpdates.length >= 500) {
    return { items: [], saturated: true }
  }

  const ledgerItems: ActivityItem[] = ledgerWindow.items.flatMap(
    (entry): ActivityItem[] => {
      if (
        typeFilter !== undefined &&
        ((isDepositDelta(entry.delta) &&
          !typeFilter.includes(ActivityType.DEPOSIT)) ||
          (isWithdrawDelta(entry.delta) &&
            !typeFilter.includes(ActivityType.WITHDRAWAL)) ||
          (!typeFilter.includes(ActivityType.FEE) &&
            (isGossipPriorityGasAuctionDelta(entry.delta) ||
              isAccountActivationGasDelta(entry.delta))) ||
          (isRewardsClaimDelta(entry.delta) &&
            !typeFilter.includes(ActivityType.REWARD)) ||
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
  const limit = getHistoryLimit(params.limit)
  const infoOpts = hlInfoOptions(client, options)
  await requireAccountExists(apiUrl, params.address, infoOpts)
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
