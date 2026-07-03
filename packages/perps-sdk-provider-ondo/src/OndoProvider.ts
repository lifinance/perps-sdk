import {
  getMarketRegistry,
  localStorageAdapter,
  PerpsError,
  type PerpsProviderPlugin,
  type PerpsSDKClient,
  type ProviderAccountExistsParams,
  type ProviderGetAccountParams,
  type ProviderGetActivityParams,
  type ProviderGetFillsParams,
  type ProviderGetOrderParams,
  type ProviderGetOrdersParams,
  type ProviderGetPositionsParams,
  type ProviderGetQuoteParams,
  resolveQuote,
  resolveRetryPolicy,
  type SDKRequestOptions,
  type SignActionsContext,
  type StorageAdapter,
  toMarketDisplay,
} from '@lifi/perps-sdk'
import type {
  AccountConfig,
  AccountConfigSetting,
  AccountResponse,
  AccountSummary,
  ActionResult,
  ActionStep,
  ActivitiesResponse,
  ActivityItem,
  FillsResponse,
  MarketDisplay,
  OndoAccountConfig,
  Order,
  OrdersResponse,
  Position,
  PositionsResponse,
  ProviderAction,
  Quote,
  RestCallSignedActionStep,
  SignedActionStep,
  SigningMethod,
} from '@lifi/perps-types'
import { ActivityType, PerpsErrorCode } from '@lifi/perps-types'
import type { Address } from 'viem'
import { projectOndoConfigSettings } from './accountConfig.js'
import { getAccountSummary } from './accountSummary.js'
import { OndoTokenStore } from './auth/OndoTokenStore.js'
import {
  executeOndoRestCallActions,
  ondoSignActions,
} from './auth/signActions.js'
import {
  DEFAULT_ONDO_API_URL,
  ONDO_BASE_FEE_TIER,
  ONDO_PROVIDER_KEY,
} from './constants.js'
import type {
  OnBalanceSummary,
  OnFill,
  OnFundingFeeTransfer,
  OnLiquidationEvent,
  OnOrder,
  OnPosition,
} from './types/wire.js'
import {
  decodeActivityCursor,
  encodeActivityCursor,
  type OndoActivityCursor,
} from './utils/activityCursor.js'
import {
  type ApiParams,
  ONDO_RETRY_DEFAULTS,
  OndoApiClient,
  type OndoPage,
  OndoSessionExpiredError,
} from './utils/apiClient.js'
import {
  classifyAndMapOrders,
  estimateLiquidationPrice,
  formatOrderPrice,
  formatOrderSize,
  mapFill,
  mapFundingActivity,
  mapLiquidationActivity,
  mapOpenPositions,
  mapOrderDetail,
  ondoAsset,
} from './utils/index.js'

/**
 * Construction options for the Ondo {@link PerpsProviderPlugin}.
 *
 * @public
 */
export interface OndoProviderOptions {
  /** Ondo REST base URL. Defaults to production; pass the sandbox URL to override. */
  apiUrl?: string
  /** Session-token persistence backend. Defaults to browser `localStorage`. */
  storage?: StorageAdapter
}

/**
 * Ondo provider plugin factory. Returns an object implementing
 * {@link PerpsProviderPlugin}, mirroring `lighterProvider()`.
 *
 * Per-user reads call Ondo's REST API directly — every one requires the
 * session JWT obtained through the SIWE login and stored in the token store.
 * Without a stored token the reads degrade gracefully (empty pages,
 * `loggedIn: false` config) instead of failing; `getOrder` throws because an
 * empty result would be indistinguishable from "order not found".
 *
 * @example
 * ```ts
 * const client = createPerpsClient({
 *   integrator: 'my-app',
 *   providers: [ondoProvider()],
 * })
 * ```
 * @public
 */
export const ondoProvider = (
  options: OndoProviderOptions = {}
): PerpsProviderPlugin => {
  // Late-bind slot: the factory runs before the client exists, so `bind`
  // assigns this once during createPerpsClient and the read methods read it.
  let boundClient: PerpsSDKClient | undefined

  const requireClient = (): PerpsSDKClient => {
    if (boundClient === undefined) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'ondoProvider used before binding. Register it via ' +
          'createPerpsClient({ providers: [ondoProvider()] }).'
      )
    }
    return boundClient
  }

  const apiUrl = options.apiUrl ?? DEFAULT_ONDO_API_URL
  const tokenStore = new OndoTokenStore(
    options.storage ?? localStorageAdapter,
    apiUrl
  )

  const apiClient = (opts?: SDKRequestOptions): OndoApiClient => {
    const client = requireClient()
    return new OndoApiClient(apiUrl, {
      signal: opts?.signal,
      policy: resolveRetryPolicy(
        ONDO_RETRY_DEFAULTS,
        client.config.retry,
        ONDO_PROVIDER_KEY
      ),
      fetchImpl: client.config.fetch,
    })
  }

  const marketRegistry = () =>
    getMarketRegistry(requireClient(), ONDO_PROVIDER_KEY)

  const requireMarketDisplay = (marketId: string): MarketDisplay =>
    toMarketDisplay(marketRegistry().require(marketId))

  const emptyConfig: OndoAccountConfig = {
    provider: ONDO_PROVIDER_KEY,
    loggedIn: false,
  }

  return {
    type: ONDO_PROVIDER_KEY,

    bind(client: PerpsSDKClient): void {
      boundClient = client
    },

    async getAccount(
      params: ProviderGetAccountParams,
      opts?: SDKRequestOptions
    ): Promise<AccountResponse> {
      const token = await tokenStore.get(params.address)
      if (token === null) {
        return {
          provider: ONDO_PROVIDER_KEY,
          address: params.address,
          balances: [],
          collateralBalances: [],
          positions: [],
          marginUsed: '0',
          unrealizedPnl: '0',
          feeTier: ONDO_BASE_FEE_TIER,
          config: emptyConfig,
        }
      }

      const client = apiClient(opts)
      const registry = marketRegistry()
      const [balance, rawPositions] = await Promise.all([
        client.get<OnBalanceSummary>('/v1/perps/balance', {
          authToken: token.token,
        }),
        client.get<OnPosition[]>('/v1/perps/positions', {
          authToken: token.token,
        }),
        registry.sync(),
      ])

      const positions: Position[] = mapOpenPositions(
        rawPositions,
        requireMarketDisplay
      )

      // Single USD collateral row: `walletBalance` is gross (locked margin
      // included, unrealized PnL excluded — the positions carry it).
      return {
        provider: ONDO_PROVIDER_KEY,
        address: params.address,
        balances: [],
        collateralBalances: [
          {
            categoryId: ONDO_PROVIDER_KEY,
            asset: ondoAsset('USD', 'USD'),
            units: balance.walletBalance,
            valueUsd: balance.walletBalance,
          },
        ],
        positions,
        marginUsed: balance.usedMargin,
        unrealizedPnl: balance.unrealizedPnl,
        feeTier: ONDO_BASE_FEE_TIER,
        config: {
          provider: ONDO_PROVIDER_KEY,
          loggedIn: true,
          authTokenExpiry: token.expirationSecs,
        },
      }
    },

    async accountExists(
      params: ProviderAccountExistsParams,
      opts?: SDKRequestOptions
    ): Promise<boolean> {
      const token = await tokenStore.get(params.address)
      if (token === null) {
        return false
      }
      try {
        await apiClient(opts).get('/v1/account', { authToken: token.token })
        return true
      } catch (err) {
        if (err instanceof OndoSessionExpiredError) {
          await tokenStore.remove(params.address)
          return false
        }
        throw err
      }
    },

    async getPositions(
      params: ProviderGetPositionsParams,
      opts?: SDKRequestOptions
    ): Promise<PositionsResponse> {
      const token = await tokenStore.get(params.address)
      if (token === null) {
        return {
          provider: ONDO_PROVIDER_KEY,
          positions: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }
      }

      const client = apiClient(opts)
      const [rawPositions] = await Promise.all([
        client.get<OnPosition[]>('/v1/perps/positions', {
          authToken: token.token,
        }),
        marketRegistry().sync(),
      ])

      let positions: Position[] = mapOpenPositions(
        rawPositions,
        requireMarketDisplay
      )
      if (params.marketId !== undefined) {
        positions = positions.filter((p) => p.market.id === params.marketId)
      }

      return {
        provider: ONDO_PROVIDER_KEY,
        positions,
        pagination: { limit: params.limit ?? positions.length, hasMore: false },
      }
    },

    async getOrders(
      params: ProviderGetOrdersParams,
      opts?: SDKRequestOptions
    ): Promise<OrdersResponse> {
      const token = await tokenStore.get(params.address)
      if (token === null) {
        return {
          provider: ONDO_PROVIDER_KEY,
          openOrders: [],
          triggerOrders: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }
      }

      const client = apiClient(opts)
      const queryParams: ApiParams = {}
      if (params.marketId !== undefined) {
        queryParams.market = params.marketId
      }
      if (params.limit !== undefined) {
        queryParams.limit = params.limit
      }
      if (params.cursor !== undefined) {
        queryParams.cursor = params.cursor
      }
      const [page] = await Promise.all([
        client.getPage<OnOrder>('/v1/perps/orders', {
          params: queryParams,
          authToken: token.token,
        }),
        marketRegistry().sync(),
      ])

      const registry = marketRegistry()
      const { openOrders, triggerOrders } = classifyAndMapOrders(
        page.result,
        (marketId) => {
          const market = registry.get(marketId)
          return market === undefined ? undefined : toMarketDisplay(market)
        }
      )

      const nextCursor = page.pageInfo?.nextCursor
      return {
        provider: ONDO_PROVIDER_KEY,
        openOrders,
        triggerOrders,
        pagination: {
          limit: params.limit ?? openOrders.length + triggerOrders.length,
          hasMore: nextCursor !== undefined,
          ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
        },
      }
    },

    async getOrder(
      params: ProviderGetOrderParams,
      opts?: SDKRequestOptions
    ): Promise<Order> {
      const token = await tokenStore.get(params.address)
      if (token === null) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          'Ondo order lookup requires a session token. Run the SIWE login first.'
        )
      }

      const client = apiClient(opts)
      const [order] = await Promise.all([
        client.get<OnOrder>(
          `/v1/perps/orders/${encodeURIComponent(params.id)}`,
          { authToken: token.token }
        ),
        marketRegistry().sync(),
      ])
      return mapOrderDetail(order, requireMarketDisplay(order.market))
    },

    async getFills(
      params: ProviderGetFillsParams,
      opts?: SDKRequestOptions
    ): Promise<FillsResponse> {
      const token = await tokenStore.get(params.address)
      if (token === null) {
        return {
          provider: ONDO_PROVIDER_KEY,
          items: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }
      }

      const client = apiClient(opts)
      const queryParams: ApiParams = {}
      if (params.limit !== undefined) {
        queryParams.limit = params.limit
      }
      if (params.cursor !== undefined) {
        queryParams.cursor = params.cursor
      }
      const [page] = await Promise.all([
        client.getPage<OnFill>('/v1/perps/fills', {
          params: queryParams,
          authToken: token.token,
        }),
        marketRegistry().sync(),
      ])

      const items = page.result.map((fill) =>
        mapFill(fill, requireMarketDisplay(fill.market))
      )

      const nextCursor = page.pageInfo?.nextCursor
      return {
        provider: ONDO_PROVIDER_KEY,
        items,
        pagination: {
          limit: params.limit ?? items.length,
          hasMore: nextCursor !== undefined,
          ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
        },
      }
    },

    async getActivity(
      params: ProviderGetActivityParams,
      opts?: SDKRequestOptions
    ): Promise<ActivitiesResponse> {
      const token = await tokenStore.get(params.address)
      if (token === null) {
        return {
          provider: ONDO_PROVIDER_KEY,
          items: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }
      }

      const inputCursor = decodeActivityCursor(params.cursor)
      const client = apiClient(opts)

      const wantsType = (t: ActivityType): boolean =>
        params.type === undefined || params.type.includes(t)
      const shouldFetch = (
        t: ActivityType,
        key: 'fundings' | 'liquidations'
      ): boolean => {
        if (!wantsType(t)) {
          return false
        }
        if (inputCursor === undefined) {
          return true
        }
        const v = inputCursor[key]
        return typeof v === 'string' && v.length > 0
      }
      const cursorParams = (key: 'fundings' | 'liquidations'): ApiParams => {
        const v = inputCursor?.[key]
        return typeof v === 'string' && v.length > 0 ? { cursor: v } : {}
      }
      const emptyPage = <T>(): OndoPage<T> => ({
        result: [],
        pageInfo: undefined,
      })

      const [fundings, liquidations] = await Promise.all([
        shouldFetch(ActivityType.FUNDING, 'fundings')
          ? client.getPage<OnFundingFeeTransfer>('/v1/perps/funding_fees', {
              params: cursorParams('fundings'),
              authToken: token.token,
            })
          : Promise.resolve(emptyPage<OnFundingFeeTransfer>()),
        shouldFetch(ActivityType.LIQUIDATION, 'liquidations')
          ? client.getPage<OnLiquidationEvent>(
              '/v1/perps/liquidation_history',
              {
                params: cursorParams('liquidations'),
                authToken: token.token,
              }
            )
          : Promise.resolve(emptyPage<OnLiquidationEvent>()),
        marketRegistry().sync(),
      ])

      const items: ActivityItem[] = [
        ...fundings.result.map((f) =>
          mapFundingActivity(f, requireMarketDisplay(f.market))
        ),
        ...liquidations.result.map((l) =>
          mapLiquidationActivity(l, requireMarketDisplay)
        ),
      ]

      const merged = [...(inputCursor?.overflow ?? []), ...items]

      const filtered = merged.filter((it) => {
        const ts = new Date(it.timestamp).getTime()
        if (params.startTime !== undefined && ts < params.startTime) {
          return false
        }
        if (params.endTime !== undefined && ts > params.endTime) {
          return false
        }
        return true
      })

      filtered.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )

      const limit = params.limit ?? filtered.length
      const emitted = filtered.slice(0, limit)
      const overflow = filtered.slice(limit)

      const nextCursorEnvelope: OndoActivityCursor = {
        fundings: fundings.pageInfo?.nextCursor,
        liquidations: liquidations.pageInfo?.nextCursor,
        overflow,
      }
      const responseCursor = encodeActivityCursor(nextCursorEnvelope)
      const hasMore = responseCursor !== undefined

      return {
        provider: ONDO_PROVIDER_KEY,
        items: emitted,
        pagination: {
          limit,
          hasMore,
          ...(responseCursor === undefined ? {} : { cursor: responseCursor }),
        },
      }
    },

    getQuote(
      params: ProviderGetQuoteParams,
      opts?: SDKRequestOptions
    ): Promise<Quote> {
      return resolveQuote(
        requireClient(),
        ONDO_PROVIDER_KEY,
        params,
        ONDO_BASE_FEE_TIER,
        opts
      )
    },

    getAccountSummary(
      account: AccountResponse,
      positions: Position[]
    ): AccountSummary {
      return getAccountSummary(account, positions)
    },

    formatOrderPrice,

    formatOrderSize,

    estimateLiquidationPrice,

    projectConfig(
      config: AccountConfig,
      setup: ProviderAction[],
      configOptions: ProviderAction[]
    ): AccountConfigSetting[] {
      return projectOndoConfigSettings(config, setup, configOptions)
    },

    signActions(
      method: SigningMethod,
      steps: ActionStep[],
      address: Address,
      ctx?: SignActionsContext
    ): Promise<SignedActionStep[]> {
      return ondoSignActions(
        { client: apiClient(), tokenStore },
        method,
        steps,
        address,
        ctx
      )
    },

    executeRestCallActions(
      steps: RestCallSignedActionStep[],
      _address: Address,
      opts?: SDKRequestOptions
    ): Promise<ActionResult[]> {
      return executeOndoRestCallActions(apiClient(opts), steps)
    },
  }
}

/**
 * Alias matching `@lifi/sdk`'s capitalised factory naming (`EVM()`, `Lighter`).
 *
 * @public
 */
export const Ondo = ondoProvider
