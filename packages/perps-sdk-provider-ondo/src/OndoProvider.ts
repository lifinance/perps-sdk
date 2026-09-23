import {
  ACTIVE_ORDER_STATUSES,
  createWarnOnce,
  type DepositFlow,
  ETHEREUM_USDC,
  getAssetRegistry,
  getMarketRegistry,
  getProviders,
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
  type ProviderGetPortfolioHistoryParams,
  type ProviderGetPositionsParams,
  type ProviderGetQuoteParams,
  type ProviderGetWithdrawableBalancesParams,
  type ProviderWithdrawableBalance,
  paginateActivity,
  resolveQuote,
  resolveRetryPolicy,
  type SDKRequestOptions,
  type SignActionsContext,
  type StorageAdapter,
  toMarketDisplay,
  toPerpsMarketDisplay,
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
  Fill,
  FillsResponse,
  FundingActivity,
  LiquidationActivity,
  MarketDisplay,
  OndoAccountConfig,
  Order,
  OrdersResponse,
  PerpsMarketDisplay,
  PortfolioHistoryResponse,
  Position,
  PositionsResponse,
  ProviderAction,
  Quote,
  SignedActionStep,
  SigningMethod,
  WithdrawalActivity,
} from '@lifi/perps-types'
import { ActionType, ActivityType, PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
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
  OndoPortfolioGraphPoint,
  OndoPortfolioSummary,
  OndoPosition,
  OndoTwapOrder,
  OndoWalletDeposit,
  OndoWalletWithdrawal,
} from './types/wire.js'
import {
  decodeActivityCursor,
  encodeActivityCursor,
} from './utils/activityCursor.js'
import {
  type ApiParams,
  ONDO_RETRY_DEFAULTS,
  OndoApiClient,
  OndoApiError,
  type OndoPage,
  OndoSessionExpiredError,
} from './utils/apiClient.js'
import {
  estimateLiquidationPrice,
  formatOrderPrice,
  formatOrderSize,
  listOndoDepositAddress,
  mapDepositActivity,
  mapFill,
  mapFundingActivity,
  mapLiquidationActivity,
  mapOpenPositions,
  mapOrder,
  mapWithdrawalActivity,
  ondoWithdrawableBalances,
  positionMarginConstraints,
  requireOndoCollateralAsset,
} from './utils/index.js'
import { mapPortfolioHistory } from './utils/mapPortfolioHistory.js'
import {
  decodeOrderCursor,
  encodeOrderCursor,
  type OndoOrderCursor,
  type OrderSource,
} from './utils/orderCursor.js'

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
 *   apiKey: 'your-api-key',
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

  const warnDroppedOrder = createWarnOnce()

  /**
   * Map one venue row, or drop it. A row the mapper rejects, such as a
   * lifecycle state the SDK does not carry, costs only its own row instead of
   * the whole page. Each distinct mapper message warns once.
   */
  const mapOrderOrDrop = (
    raw: OndoOrder | OndoTwapOrder,
    market: MarketDisplay
  ): Order | undefined => {
    try {
      return mapOrder(raw, market)
    } catch (error) {
      if (!(error instanceof PerpsError)) {
        throw error
      }
      warnDroppedOrder(
        error.message,
        `[${ONDO_PROVIDER_KEY}] dropped order row: ${error.message}`
      )
      return undefined
    }
  }

  const requireMarketDisplay = (marketId: string): MarketDisplay =>
    toMarketDisplay(marketRegistry().require(marketId))
  // The droppable-row counterpart of `requireMarketDisplay`, for the history
  // surfaces where an id the backend market list does not hold must cost only
  // its own row. The registry warns once per unresolved id.
  const marketDisplay = (marketId: string): MarketDisplay | undefined => {
    const market = marketRegistry().get(marketId)
    return market === undefined ? undefined : toMarketDisplay(market)
  }
  const requirePerpsMarketDisplay = (marketId: string): PerpsMarketDisplay =>
    toPerpsMarketDisplay(marketRegistry().require(marketId))

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
          const [
            { providers },
            balance,
            rawPositions,
            referral,
            account,
            depositAddress,
          ] = await Promise.all([
            getProviders(requireClient(), opts),
            client.get<OndoBalanceSummary>('/v1/perps/balance', {
              authToken: token.token,
            }),
            client.get<OndoPosition[] | null>('/v1/perps/positions', {
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

          const collateralAsset = requireOndoCollateralAsset(providers)

          const positions: Position[] = mapOpenPositions(
            rawPositions ?? [],
            requirePerpsMarketDisplay
          )

          // The backend owns the collateral identity; the venue supplies its
          // wallet balance (locked margin in, unrealized PnL out).
          return {
            provider: ONDO_PROVIDER_KEY,
            address: params.address,
            balances: [],
            collateralBalances: new Big(balance.walletBalance).gt(0)
              ? [
                  {
                    categoryId: ONDO_PROVIDER_KEY,
                    asset: collateralAsset,
                    units: balance.walletBalance,
                    valueUsd: balance.walletBalance,
                    price: '1',
                  },
                ]
              : [],
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
              balance: {
                walletBalance: balance.walletBalance,
                unrealizedPnl: balance.unrealizedPnl,
                marginBalance: balance.marginBalance,
                usedMargin: balance.usedMargin,
                availableMargin: balance.availableMargin,
                withdrawableMargin: balance.withdrawableMargin,
              },
            },
          }
        }
      )
    },

    async getWithdrawableBalances(
      params: ProviderGetWithdrawableBalancesParams,
      opts?: SDKRequestOptions
    ): Promise<ProviderWithdrawableBalance[]> {
      return withSession(
        params.address,
        (): ProviderWithdrawableBalance[] => [],
        async (token) => {
          const client = apiClient(opts)
          const [{ providers }, balance, account] = await Promise.all([
            getProviders(requireClient(), opts),
            client.get<OndoBalanceSummary>('/v1/perps/balance', {
              authToken: token.token,
            }),
            client.get<OndoAccountInfo>('/v1/account', {
              authToken: token.token,
            }),
          ])
          return ondoWithdrawableBalances(
            requireOndoCollateralAsset(providers).id,
            balance,
            account.withdrawalFeeUSD
          )
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
            client.get<OndoPosition[] | null>('/v1/perps/positions', {
              authToken: token.token,
            }),
            marketRegistry().sync(),
          ])

          let positions: Position[] = mapOpenPositions(
            rawPositions ?? [],
            requirePerpsMarketDisplay
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
          orders: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }),
        async (token) => {
          const statuses =
            params.statuses === undefined
              ? ACTIVE_ORDER_STATUSES
              : new Set(params.statuses)
          const active = [...statuses].some((status) =>
            ACTIVE_ORDER_STATUSES.has(status)
          )
          const terminal = [...statuses].some(
            (status) => !ACTIVE_ORDER_STATUSES.has(status)
          )
          const sources: OrderSource[] = []
          if (terminal) {
            sources.push('all')
          } else if (active) {
            sources.push('active')
          }
          if (active) {
            sources.push('twaps')
          }
          if (terminal) {
            sources.push('history')
          }
          const previous = decodeOrderCursor(params.cursor)
          const next: OndoOrderCursor = {}
          const client = apiClient(opts)
          const queryParams: ApiParams = {}
          if (params.marketId !== undefined) {
            queryParams.market = params.marketId
          }
          if (params.limit !== undefined) {
            queryParams.limit = params.limit
          }
          const [pages] = await Promise.all([
            Promise.all(
              sources.map(async (source) => {
                const position =
                  source === 'twaps' ? undefined : previous?.[source]
                if (previous !== undefined && previous[source] === undefined) {
                  return undefined
                }
                if (source === 'twaps') {
                  const snapshot =
                    previous?.twaps ??
                    (await client.get<OndoTwapOrder[] | null>(
                      '/v1/perps/twap/orders/running',
                      {
                        authToken: token.token,
                        params:
                          params.marketId === undefined
                            ? {}
                            : { market: params.marketId },
                      }
                    )) ??
                    []
                  return {
                    source: 'twaps' as const,
                    position,
                    page: { result: snapshot, pageInfo: undefined },
                  }
                }
                const request = {
                  authToken: token.token,
                  params: {
                    ...queryParams,
                    ...(position?.cursor === undefined
                      ? {}
                      : { cursor: position.cursor }),
                    ...(position?.limit === undefined
                      ? {}
                      : { limit: position.limit }),
                  },
                }
                let page: OndoPage<OndoOrder | OndoTwapOrder>
                if (source === 'history') {
                  page = await client.getPage<OndoTwapOrder>(
                    '/v1/perps/twap/orders/history',
                    request
                  )
                } else {
                  page = await client.getPage<OndoOrder>('/v1/perps/orders', {
                    ...request,
                    params: {
                      ...request.params,
                      ...(source === 'active' ? { activeOnly: true } : {}),
                    },
                  })
                }
                return { source, position, page }
              })
            ),
            sources.length === 0 ? Promise.resolve() : marketRegistry().sync(),
          ])
          const orders: Order[] = []
          for (const result of pages) {
            if (result === undefined) {
              continue
            }
            const { position, page } = result
            let offset = position?.offset ?? 0
            for (; offset < page.result.length; offset++) {
              const raw = page.result[offset]
              if (raw === undefined) {
                continue
              }
              const market = marketDisplay(raw.market)
              if (
                market === undefined ||
                (params.marketId !== undefined &&
                  raw.market !== params.marketId)
              ) {
                continue
              }
              const order = mapOrderOrDrop(raw, market)
              if (order === undefined || !statuses.has(order.status)) {
                continue
              }
              if (params.limit !== undefined && orders.length >= params.limit) {
                break
              }
              orders.push(order)
            }
            if (result.source === 'twaps') {
              if (offset < result.page.result.length) {
                next.twaps = result.page.result.slice(offset)
              }
            } else if (offset < page.result.length) {
              const limit = position?.limit ?? params.limit
              next[result.source] = {
                offset,
                ...(position?.cursor === undefined
                  ? {}
                  : { cursor: position.cursor }),
                ...(limit === undefined ? {} : { limit }),
              }
            } else if (page.pageInfo?.nextCursor !== undefined) {
              next[result.source] = {
                offset: 0,
                cursor: page.pageInfo.nextCursor,
              }
            }
          }
          const cursor = encodeOrderCursor(next)
          return {
            provider: ONDO_PROVIDER_KEY,
            orders,
            pagination: {
              limit: params.limit ?? orders.length,
              hasMore: cursor !== undefined,
              ...(cursor === undefined ? {} : { cursor }),
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
            client
              .get<OndoOrder>(
                `/v1/perps/orders/${encodeURIComponent(params.id)}`,
                { authToken: token.token }
              )
              .catch((error: unknown) => {
                if (
                  !(error instanceof OndoApiError) ||
                  error.errorCode !== 'order_not_found'
                ) {
                  throw error
                }
                return client.get<OndoTwapOrder>(
                  `/v1/perps/twap/order/${encodeURIComponent(params.id)}`,
                  { authToken: token.token }
                )
              }),
            marketRegistry().sync(),
          ])
          return mapOrder(order, requireMarketDisplay(order.market))
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

          const items = page.result.flatMap((fill): Fill[] => {
            const market = marketDisplay(fill.market)
            return market === undefined ? [] : [mapFill(fill, market)]
          })

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
          const assetRegistry = getAssetRegistry(
            requireClient(),
            ONDO_PROVIDER_KEY
          )

          // Ondo publishes no account-to-account transfer history. Its
          // transfer surface moves value between the main and margin wallets
          // of one account, which `TransferActivity` excludes.
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
          // `/v1/wallet/deposits` and `/v1/wallet/withdrawals` accept no
          // cursor and return the whole history in one response, so each is
          // fetched on the first page only. Its tail rides the cursor's
          // `overflow` list, which is what keeps a later page from either
          // re-fetching the list or losing the rows past the limit.
          const shouldFetchOnce = (t: ActivityType): boolean =>
            wantsType(t) && inputCursor === undefined
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

          const [fundings, liquidations, deposits, withdrawals] =
            await Promise.all([
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
              shouldFetchOnce(ActivityType.DEPOSIT)
                ? client.get<OndoWalletDeposit[] | null>(
                    '/v1/wallet/deposits',
                    {
                      authToken: token.token,
                    }
                  )
                : Promise.resolve(null),
              shouldFetchOnce(ActivityType.WITHDRAWAL)
                ? client.get<OndoWalletWithdrawal[] | null>(
                    '/v1/wallet/withdrawals',
                    { authToken: token.token }
                  )
                : Promise.resolve(null),
              // Only the funding and liquidation rows name a market. A ledger
              // request alone must not pull the market list.
              wantsType(ActivityType.FUNDING) ||
              wantsType(ActivityType.LIQUIDATION)
                ? marketRegistry().sync()
                : Promise.resolve(),
              wantsType(ActivityType.DEPOSIT) ||
              wantsType(ActivityType.WITHDRAWAL)
                ? assetRegistry.sync()
                : Promise.resolve(),
            ])

          const items: ActivityItem[] = [
            ...fundings.result.flatMap((f): FundingActivity[] => {
              const market = marketDisplay(f.market)
              return market === undefined ? [] : [mapFundingActivity(f, market)]
            }),
            // A liquidation event that names no position is dropped: the
            // public contract guarantees a non-empty `liquidatedPositions`.
            ...liquidations.result
              .map((l) => mapLiquidationActivity(l, marketDisplay))
              .filter((a): a is LiquidationActivity => a !== null),
            ...(deposits ?? []).map((deposit) =>
              mapDepositActivity(deposit, assetRegistry)
            ),
            // A withdrawal Ondo reports as failed or cancelled moved no value,
            // and `WithdrawalActivity` carries no status to say so.
            ...(withdrawals ?? [])
              .map((withdrawal) =>
                mapWithdrawalActivity(withdrawal, assetRegistry)
              )
              .filter((a): a is WithdrawalActivity => a !== null),
          ]

          const page = paginateActivity(
            items,
            inputCursor?.overflow ?? [],
            params,
            (overflowTail) =>
              encodeActivityCursor({
                fundings: fundings.pageInfo?.nextCursor,
                liquidations: liquidations.pageInfo?.nextCursor,
                overflow: overflowTail,
              })
          )

          return {
            provider: ONDO_PROVIDER_KEY,
            items: page.items,
            pagination: page.pagination,
          }
        }
      )
    },

    async getPortfolioHistory(
      params: ProviderGetPortfolioHistoryParams,
      opts?: SDKRequestOptions
    ): Promise<PortfolioHistoryResponse> {
      return withSession<PortfolioHistoryResponse>(
        params.address,
        () => ({ range: params.range, points: [] }),
        async (token) => {
          const client = apiClient(opts)
          const [graph, summary] = await Promise.all([
            client.get<OndoPortfolioGraphPoint[] | null>(
              '/v1/portfolio/summary/graph',
              { params: { range: params.range }, authToken: token.token }
            ),
            client.get<OndoPortfolioSummary>('/v1/portfolio/summary', {
              authToken: token.token,
            }),
          ])
          return mapPortfolioHistory(params.range, graph ?? [], summary)
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

    getAccountSummary(account: AccountResponse): AccountSummary {
      return getAccountSummary(account)
    },

    formatOrderPrice,

    formatOrderSize,

    estimateLiquidationPrice,

    positionMarginConstraints,

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
