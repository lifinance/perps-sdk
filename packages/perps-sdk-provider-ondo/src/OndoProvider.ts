import {
  type DepositFlow,
  ETHEREUM_USDC,
  getMarketRegistry,
  localStorageAdapter,
  PerpsError,
  type PerpsProviderPlugin,
  type PerpsSDKClient,
  type ProviderAccountExistsParams,
  type ProviderGetAccountParams,
  type ProviderGetActivityParams,
  type ProviderGetDepositFlowParams,
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
  SignedActionStep,
  SigningMethod,
} from '@lifi/perps-types'
import { ActionType, ActivityType, PerpsErrorCode } from '@lifi/perps-types'
import type { Address } from 'viem'
import { projectOndoConfigSettings } from './accountConfig.js'
import { getAccountSummary } from './accountSummary.js'
import { OndoApiKeyStore } from './auth/OndoApiKeyStore.js'
import { OndoTokenStore } from './auth/OndoTokenStore.js'
import { ondoSignActions } from './auth/signActions.js'
import {
  DEFAULT_ONDO_API_URL,
  ONDO_BASE_FEE_TIER,
  ONDO_PRIVACY_VERSION,
  ONDO_PROVIDER_KEY,
  ONDO_TERMS_VERSION,
} from './constants.js'
import type { OndoAuthToken } from './types/auth.js'
import type {
  OndoAccountInfo,
  OndoAccountReferral,
  OndoBalanceSummary,
  OndoFill,
  OndoFundingFeeTransfer,
  OndoLiquidationEvent,
  OndoOrder,
  OndoPosition,
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
  listOndoDepositAddress,
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
  const storage = options.storage ?? localStorageAdapter
  const tokenStore = new OndoTokenStore(storage, apiUrl)
  const apiKeyStore = new OndoApiKeyStore(storage, apiUrl)

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
    termsAccepted: false,
    apiKeyRegistered: false,
    referralSet: false,
    depositAddress: null,
  }

  const loggedOutAccount = (address: Address): AccountResponse => ({
    provider: ONDO_PROVIDER_KEY,
    address,
    balances: [],
    collateralBalances: [],
    positions: [],
    marginUsed: '0',
    unrealizedPnl: '0',
    feeTier: ONDO_BASE_FEE_TIER,
    config: emptyConfig,
  })

  // Runs an authenticated read against a live session. An absent local token
  // and a server-revoked one (surfaced mid-call as `OndoSessionExpiredError`)
  // both evict any stale token and fall back to `loggedOut`, so a rotated
  // session never soft-locks the UI behind a token that looks valid locally.
  const withSession = async <T>(
    address: Address,
    loggedOut: () => T,
    fn: (token: OndoAuthToken) => Promise<T>
  ): Promise<T> => {
    const token = await tokenStore.get(address)
    if (token === null) {
      return loggedOut()
    }
    try {
      return await fn(token)
    } catch (err) {
      if (err instanceof OndoSessionExpiredError) {
        await tokenStore.remove(address)
        return loggedOut()
      }
      throw err
    }
  }

  return {
    type: ONDO_PROVIDER_KEY,

    internalSetupActions: [ActionType.SET_REFERRAL],

    bind(client: PerpsSDKClient): void {
      boundClient = client
    },

    async getAccount(
      params: ProviderGetAccountParams,
      opts?: SDKRequestOptions
    ): Promise<AccountResponse> {
      const apiKeyRegistered = (await apiKeyStore.get(params.address)) !== null
      return withSession(
        params.address,
        () => {
          const account = loggedOutAccount(params.address)
          return {
            ...account,
            config: { ...emptyConfig, apiKeyRegistered },
          }
        },
        async (token) => {
          const client = apiClient(opts)
          const [balance, rawPositions, referral, account, depositAddress] =
            await Promise.all([
              client.get<OndoBalanceSummary>('/v1/perps/balance', {
                authToken: token.token,
              }),
              client.get<OndoPosition[]>('/v1/perps/positions', {
                authToken: token.token,
              }),
              client.get<OndoAccountReferral | null>('/v1/account/referral', {
                authToken: token.token,
              }),
              client.get<OndoAccountInfo>('/v1/account', {
                authToken: token.token,
              }),
              listOndoDepositAddress(client, token.token),
              marketRegistry().sync(),
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
              termsAccepted:
                account.termsVersion === ONDO_TERMS_VERSION &&
                account.privacyVersion === ONDO_PRIVACY_VERSION,
              apiKeyRegistered,
              referralSet: referral !== null && referral !== undefined,
              depositAddress,
            },
          }
        }
      )
    },

    async accountExists(
      params: ProviderAccountExistsParams,
      opts?: SDKRequestOptions
    ): Promise<boolean> {
      return withSession(
        params.address,
        () => false,
        async (token) => {
          await apiClient(opts).get('/v1/account', { authToken: token.token })
          return true
        }
      )
    },

    async getDepositFlow(
      params: ProviderGetDepositFlowParams,
      opts?: SDKRequestOptions
    ): Promise<DepositFlow> {
      // Ondo credits deposits to a per-user address the venue provisions behind
      // an authenticated session, so both the session and the address must exist
      // before a route has a recipient.
      return withSession<DepositFlow>(
        params.address,
        () => ({
          kind: 'setupRequired',
          setup: [ActionType.SIWE_LOGIN, ActionType.CREATE_DEPOSIT_ADDRESS],
        }),
        async (token) => {
          const depositAddress = await listOndoDepositAddress(
            apiClient(opts),
            token.token
          )
          if (depositAddress === null) {
            return {
              kind: 'setupRequired',
              setup: [ActionType.CREATE_DEPOSIT_ADDRESS],
            }
          }
          return {
            kind: 'lifiSwap',
            destination: ETHEREUM_USDC,
            toAddress: depositAddress,
          }
        }
      )
    },

    async getPositions(
      params: ProviderGetPositionsParams,
      opts?: SDKRequestOptions
    ): Promise<PositionsResponse> {
      return withSession<PositionsResponse>(
        params.address,
        () => ({
          provider: ONDO_PROVIDER_KEY,
          positions: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }),
        async (token) => {
          const client = apiClient(opts)
          const [rawPositions] = await Promise.all([
            client.get<OndoPosition[]>('/v1/perps/positions', {
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
            pagination: {
              limit: params.limit ?? positions.length,
              hasMore: false,
            },
          }
        }
      )
    },

    async getOrders(
      params: ProviderGetOrdersParams,
      opts?: SDKRequestOptions
    ): Promise<OrdersResponse> {
      return withSession<OrdersResponse>(
        params.address,
        () => ({
          provider: ONDO_PROVIDER_KEY,
          openOrders: [],
          triggerOrders: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }),
        async (token) => {
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
            client.getPage<OndoOrder>('/v1/perps/orders', {
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
        }
      )
    },

    async getOrder(
      params: ProviderGetOrderParams,
      opts?: SDKRequestOptions
    ): Promise<Order> {
      return withSession(
        params.address,
        (): Order => {
          throw new PerpsError(
            PerpsErrorCode.SDKError,
            'Ondo order lookup requires a session token. Run the SIWE login first.'
          )
        },
        async (token) => {
          const client = apiClient(opts)
          const [order] = await Promise.all([
            client.get<OndoOrder>(
              `/v1/perps/orders/${encodeURIComponent(params.id)}`,
              { authToken: token.token }
            ),
            marketRegistry().sync(),
          ])
          return mapOrderDetail(order, requireMarketDisplay(order.market))
        }
      )
    },

    async getFills(
      params: ProviderGetFillsParams,
      opts?: SDKRequestOptions
    ): Promise<FillsResponse> {
      return withSession<FillsResponse>(
        params.address,
        () => ({
          provider: ONDO_PROVIDER_KEY,
          items: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }),
        async (token) => {
          const client = apiClient(opts)
          const queryParams: ApiParams = {}
          if (params.limit !== undefined) {
            queryParams.limit = params.limit
          }
          if (params.cursor !== undefined) {
            queryParams.cursor = params.cursor
          }
          const [page] = await Promise.all([
            client.getPage<OndoFill>('/v1/perps/fills', {
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
        }
      )
    },

    async getActivity(
      params: ProviderGetActivityParams,
      opts?: SDKRequestOptions
    ): Promise<ActivitiesResponse> {
      return withSession<ActivitiesResponse>(
        params.address,
        () => ({
          provider: ONDO_PROVIDER_KEY,
          items: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }),
        async (token) => {
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
          const cursorParams = (
            key: 'fundings' | 'liquidations'
          ): ApiParams => {
            const v = inputCursor?.[key]
            return typeof v === 'string' && v.length > 0 ? { cursor: v } : {}
          }
          const emptyPage = <T>(): OndoPage<T> => ({
            result: [],
            pageInfo: undefined,
          })

          const [fundings, liquidations] = await Promise.all([
            shouldFetch(ActivityType.FUNDING, 'fundings')
              ? client.getPage<OndoFundingFeeTransfer>(
                  '/v1/perps/funding_fees',
                  {
                    params: cursorParams('fundings'),
                    authToken: token.token,
                  }
                )
              : Promise.resolve(emptyPage<OndoFundingFeeTransfer>()),
            shouldFetch(ActivityType.LIQUIDATION, 'liquidations')
              ? client.getPage<OndoLiquidationEvent>(
                  '/v1/perps/liquidation_history',
                  {
                    params: cursorParams('liquidations'),
                    authToken: token.token,
                  }
                )
              : Promise.resolve(emptyPage<OndoLiquidationEvent>()),
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
              ...(responseCursor === undefined
                ? {}
                : { cursor: responseCursor }),
            },
          }
        }
      )
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

    async signActions(
      method: SigningMethod,
      steps: ActionStep[],
      address: Address,
      ctx?: SignActionsContext
    ): Promise<SignedActionStep[]> {
      try {
        return await ondoSignActions(
          { client: apiClient(), tokenStore, apiKeyStore },
          method,
          steps,
          address,
          ctx
        )
      } catch (err) {
        if (err instanceof OndoSessionExpiredError) {
          await tokenStore.remove(address)
        }
        throw err
      }
    },

    // The venue rejecting an HMAC-signed request with Unauthorized means the
    // locally stored API key is dead (deleted or descoped venue-side); evict
    // it so REGISTER_API_KEY re-stages instead of every action failing.
    async onExecuteResults(
      address: Address,
      results: ActionResult[]
    ): Promise<void> {
      const unauthorized = results.some(
        (result) =>
          !result.success && result.errorCode === PerpsErrorCode.Unauthorized
      )
      if (unauthorized) {
        await apiKeyStore.remove(address)
      }
    },
  }
}

/**
 * Alias matching `@lifi/sdk`'s capitalised factory naming (`EVM()`, `Lighter`).
 *
 * @public
 */
export const Ondo = ondoProvider
