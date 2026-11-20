import {
  ACTIVE_ORDER_STATUSES,
  type ActionSignerContribution,
  calculateTransferable,
  compareDecimalStrings,
  createWarnOnce,
  type DepositFlow,
  estimateLiquidationPriceAtMarketRate,
  getMarketRegistry,
  getProviders,
  isDecimalStringGreaterThan,
  localStorageAdapter,
  PerpsError,
  type PerpsProviderPlugin,
  type PerpsSDKClient,
  type ProviderAccountExistsParams,
  type ProviderGetAccountParams,
  type ProviderGetActivityParams,
  type ProviderGetDepositFlowParams,
  type ProviderGetFillsParams,
  type ProviderGetMarketSettingsParams,
  type ProviderGetOrderParams,
  type ProviderGetOrdersParams,
  type ProviderGetPositionsParams,
  type ProviderGetQuoteParams,
  type ProviderGetWithdrawableBalancesParams,
  type ProviderGetWithdrawFlowParams,
  type ProviderWithdrawableBalance,
  resolveQuote,
  resolveRetryPolicy,
  type SDKRequestOptions,
  type SignActionsContext,
  type SignActionsResult,
  type StorageAdapter,
  toMarketDisplay,
  toPerpsMarketDisplay,
  unknownToDecimalString,
  type WithdrawFlow,
} from '@lifi/perps-sdk'
import {
  type AccountConfig,
  type AccountConfigSetting,
  type AccountResponse,
  type AccountSummary,
  type ActionResult,
  type ActionStep,
  ActionType,
  type ActivitiesResponse,
  type ActivityItem,
  ActivityType,
  type Address,
  type ExtendedAccountConfig,
  type FillsResponse,
  MarginMode,
  type MarketDisplay,
  type MarketSettings,
  type Order,
  type OrdersResponse,
  PerpsErrorCode,
  type Position,
  type PositionsResponse,
  type Quote,
  type SetupAction,
  type SigningMethod,
  UserActionStatus,
} from '@lifi/perps-types'
import { getAddress } from 'viem'
import { projectExtendedConfigSettings } from './accountConfig.js'
import { getAccountSummary } from './accountSummary.js'
import {
  ExtendedCredentialStore,
  type ExtendedCredentials,
} from './auth/ExtendedCredentialStore.js'
import { extendedSignActions } from './auth/signActions.js'
import {
  DEFAULT_EXTENDED_API_URL,
  EXTENDED_BASE_FEE_TIER,
  EXTENDED_DEPOSIT_COLLATERAL,
  EXTENDED_DEPOSIT_GAS,
  EXTENDED_PROVIDER_KEY,
  EXTENDED_SIGNING_DOMAIN,
} from './constants.js'
import { EXTENDED_MAINNET_STARK_DOMAIN } from './signing/starkMessageHash.js'
import type {
  ExtendedAssetOperation,
  ExtendedBalance,
  ExtendedLeverage,
  ExtendedOrder,
  ExtendedPosition,
  ExtendedTrade,
} from './types/wire.js'
import {
  EXTENDED_RETRY_DEFAULTS,
  ExtendedApiClient,
  ExtendedApiError,
} from './utils/apiClient.js'
import { requireExtendedCollateralAsset } from './utils/collateralAsset.js'
import { mapAssetOperation } from './utils/mapActivity.js'
import { mapFill } from './utils/mapFill.js'
import { mapOrder } from './utils/mapOrder.js'
import {
  calculateRoe,
  mapPosition,
  remarkPosition,
} from './utils/mapPosition.js'
import { snapOrderPrice, snapOrderSize } from './utils/orderFormatting.js'

/**
 * Construction options for the Extended {@link PerpsProviderPlugin}.
 *
 * @public
 */
export interface ExtendedProviderOptions {
  /** Extended host. Defaults to mainnet. */
  apiUrl?: string
  /** Credential persistence backend. Defaults to browser `localStorage`. */
  storage?: StorageAdapter
}

const isUnauthorized = (error: unknown): error is ExtendedApiError =>
  error instanceof ExtendedApiError &&
  error.code === PerpsErrorCode.Unauthorized

const venueError = (code: PerpsErrorCode, message: string): PerpsError => {
  const error = new PerpsError(code, message)
  error.tool = EXTENDED_PROVIDER_KEY
  return error
}

/**
 * Extended provider plugin factory.
 *
 * Every account read goes from the client straight to Extended with the
 * account's API key from the credential store; the key never reaches the
 * LI.FI backend. A data read throws `SetupRequired` when this device holds no
 * credentials and `Unauthorized` when Extended refuses the stored API key,
 * which is removed first. A status read (`getAccount`, `accountExists`)
 * reports the state without credentials instead.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({
 *   apiKey: 'your-api-key',
 *   providers: [extendedProvider()],
 * })
 * ```
 * @public
 */
export const extendedProvider = (
  options: ExtendedProviderOptions = {}
): PerpsProviderPlugin => {
  let boundClient: PerpsSDKClient | undefined

  const requireClient = (): PerpsSDKClient => {
    if (boundClient === undefined) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'extendedProvider used before binding. Register it via ' +
          'createPerpsClient({ providers: [extendedProvider()] }).'
      )
    }
    return boundClient
  }

  const apiUrl = (options.apiUrl ?? DEFAULT_EXTENDED_API_URL).replace(/\/$/, '')
  const credentialStore = new ExtendedCredentialStore(
    options.storage ?? localStorageAdapter,
    apiUrl
  )

  const apiClient = (opts?: SDKRequestOptions): ExtendedApiClient => {
    const client = requireClient()
    return new ExtendedApiClient(apiUrl, {
      signal: opts?.signal,
      policy: resolveRetryPolicy(
        EXTENDED_RETRY_DEFAULTS,
        client.config.retry,
        EXTENDED_PROVIDER_KEY
      ),
      fetchImpl: client.config.fetch,
    })
  }

  const marketRegistry = () =>
    getMarketRegistry(requireClient(), EXTENDED_PROVIDER_KEY)

  const warnDroppedOrder = createWarnOnce()

  const mapOrderOrDrop = (
    raw: ExtendedOrder,
    market: MarketDisplay
  ): Order[] => {
    try {
      return mapOrder(raw, market)
    } catch (error) {
      if (!(error instanceof PerpsError)) {
        throw error
      }
      warnDroppedOrder(
        error.message,
        `[${EXTENDED_PROVIDER_KEY}] dropped order row: ${error.message}`
      )
      return []
    }
  }

  const marketDisplay = (marketId: string): MarketDisplay | undefined => {
    const market = marketRegistry().get(marketId)
    return market === undefined ? undefined : toMarketDisplay(market)
  }

  const mapPositions = (rows: ExtendedPosition[]): Position[] =>
    rows.flatMap((row) => {
      const position = mapPosition(
        row,
        toPerpsMarketDisplay(marketRegistry().require(row.market))
      )
      return position === undefined ? [] : [position]
    })

  // Runs a read with the stored credentials. `missing` answers when this
  // device holds none; `rejected` answers after Extended refuses the API key,
  // which is removed first so the setup step stages again.
  const withCredentials = async <T>(
    address: Address,
    fallback: { missing: () => T; rejected: () => T },
    fn: (credentials: ExtendedCredentials) => Promise<T>
  ): Promise<T> => {
    const credentials = await credentialStore.get(address)
    if (credentials === null) {
      return fallback.missing()
    }
    try {
      return await fn(credentials)
    } catch (error) {
      if (isUnauthorized(error)) {
        await credentialStore.remove(address)
        return fallback.rejected()
      }
      throw error
    }
  }

  const dataRead = (read: string) => ({
    missing: (): never => {
      throw venueError(
        PerpsErrorCode.SetupRequired,
        `Extended ${read} requires the account credentials on this device. Run the Extended setup.`
      )
    },
    rejected: (): never => {
      throw venueError(
        PerpsErrorCode.Unauthorized,
        `Extended refused the stored API key for the ${read}. Run the Extended setup again.`
      )
    },
  })

  const statusRead = <T>(withoutCredentials: () => T) => ({
    missing: withoutCredentials,
    rejected: withoutCredentials,
  })

  const accountWithoutCredentials = (address: Address): AccountResponse => ({
    provider: EXTENDED_PROVIDER_KEY,
    address,
    balances: [],
    collateralBalances: [],
    positions: [],
    marginUsed: '0',
    unrealizedPnl: '0',
    feeTier: EXTENDED_BASE_FEE_TIER,
    config: { provider: EXTENDED_PROVIDER_KEY, apiKeyRegistered: false },
  })

  // Extended answers 404 for the balance of an account that holds nothing.
  const readBalance = (
    client: ExtendedApiClient,
    apiKey: string
  ): Promise<ExtendedBalance | null> =>
    client
      .send<ExtendedBalance>('GET', '/api/v1/user/balance', { apiKey })
      .catch((error: unknown) => {
        if (error instanceof ExtendedApiError && error.httpStatus === 404) {
          return null
        }
        throw error
      })

  return {
    type: EXTENDED_PROVIDER_KEY,

    bind(client: PerpsSDKClient): void {
      boundClient = client
    },

    getAccount(
      params: ProviderGetAccountParams,
      opts?: SDKRequestOptions
    ): Promise<AccountResponse> {
      return withCredentials(
        params.address,
        statusRead(() => accountWithoutCredentials(params.address)),
        async ({ apiKey }) => {
          const client = apiClient(opts)
          const [{ providers }, balance, rawPositions] = await Promise.all([
            getProviders(requireClient(), opts),
            readBalance(client, apiKey),
            client.send<ExtendedPosition[]>('GET', '/api/v1/user/positions', {
              apiKey,
            }),
            marketRegistry().sync(),
          ])
          const collateral = requireExtendedCollateralAsset(providers)
          const positions = mapPositions(rawPositions)
          const config: ExtendedAccountConfig = {
            provider: EXTENDED_PROVIDER_KEY,
            apiKeyRegistered: true,
          }
          if (balance === null) {
            return {
              ...accountWithoutCredentials(params.address),
              positions,
              config,
            }
          }
          const units = unknownToDecimalString(
            balance.balance,
            'balance.balance',
            EXTENDED_PROVIDER_KEY
          )
          return {
            provider: EXTENDED_PROVIDER_KEY,
            address: params.address,
            balances: [],
            collateralBalances: isDecimalStringGreaterThan(units, '0')
              ? [
                  {
                    categoryId: EXTENDED_PROVIDER_KEY,
                    asset: collateral,
                    units,
                    valueUsd: units,
                    price: '1',
                    transferable: calculateTransferable(
                      unknownToDecimalString(
                        balance.availableForWithdrawal,
                        'balance.availableForWithdrawal',
                        EXTENDED_PROVIDER_KEY
                      ),
                      units
                    ),
                  },
                ]
              : [],
            positions,
            marginUsed: balance.initialMargin,
            unrealizedPnl: balance.unrealisedPnl,
            feeTier: EXTENDED_BASE_FEE_TIER,
            config: {
              ...config,
              balance: {
                balance: balance.balance,
                equity: balance.equity,
                availableForTrade: balance.availableForTrade,
                availableForWithdrawal: balance.availableForWithdrawal,
                unrealizedPnl: balance.unrealisedPnl,
                initialMargin: balance.initialMargin,
              },
            },
          }
        }
      )
    },

    /**
     * A deposit always runs Extended's Rhino.fi bridge from Arbitrum, because
     * the bridge needs a quote committed with the account's API key.
     */
    async getDepositFlow(
      params: ProviderGetDepositFlowParams
    ): Promise<DepositFlow> {
      if ((await credentialStore.get(params.address)) === null) {
        return { kind: 'setupRequired', setup: [ActionType.REGISTER_API_KEY] }
      }
      return {
        kind: 'venueDepositPipeline',
        chainId: EXTENDED_DEPOSIT_COLLATERAL.chainId,
        gasAsset: EXTENDED_DEPOSIT_GAS,
        collateral: EXTENDED_DEPOSIT_COLLATERAL,
        bridgeAction: ActionType.DEPOSIT,
      }
    },

    /** A withdrawal goes to the user's own address on the destination chain. */
    async getWithdrawFlow(
      params: ProviderGetWithdrawFlowParams
    ): Promise<WithdrawFlow> {
      if ((await credentialStore.get(params.address)) === null) {
        return { kind: 'setupRequired', setup: [ActionType.REGISTER_API_KEY] }
      }
      return { kind: 'ready', destination: getAddress(params.address) }
    },

    getWithdrawableBalances(
      params: ProviderGetWithdrawableBalancesParams,
      opts?: SDKRequestOptions
    ): Promise<ProviderWithdrawableBalance[]> {
      return withCredentials(
        params.address,
        dataRead('withdrawable balance read'),
        async ({ apiKey }) => {
          const [{ providers }, balance] = await Promise.all([
            getProviders(requireClient(), opts),
            readBalance(apiClient(opts), apiKey),
          ])
          const available =
            balance === null
              ? '0'
              : unknownToDecimalString(
                  balance.availableForWithdrawal,
                  'balance.availableForWithdrawal',
                  EXTENDED_PROVIDER_KEY
                )
          if (!isDecimalStringGreaterThan(available, '0')) {
            return []
          }
          return [
            {
              assetId: requireExtendedCollateralAsset(providers).id,
              categoryId: EXTENDED_PROVIDER_KEY,
              available,
              max: available,
            },
          ]
        }
      )
    },

    accountExists(
      params: ProviderAccountExistsParams,
      opts?: SDKRequestOptions
    ): Promise<boolean> {
      return withCredentials(
        params.address,
        statusRead(() => false),
        async ({ apiKey }) => {
          await apiClient(opts).send('GET', '/api/v1/user/account/info', {
            apiKey,
          })
          return true
        }
      )
    },

    getPositions(
      params: ProviderGetPositionsParams,
      opts?: SDKRequestOptions
    ): Promise<PositionsResponse> {
      return withCredentials(
        params.address,
        dataRead('positions read'),
        async ({ apiKey }) => {
          const [rows] = await Promise.all([
            apiClient(opts).send<ExtendedPosition[]>(
              'GET',
              params.marketId === undefined
                ? '/api/v1/user/positions'
                : `/api/v1/user/positions?market=${encodeURIComponent(params.marketId)}`,
              { apiKey }
            ),
            marketRegistry().sync(),
          ])
          const positions = mapPositions(rows)
          return {
            provider: EXTENDED_PROVIDER_KEY,
            positions,
            pagination: {
              limit: params.limit ?? positions.length,
              hasMore: false,
            },
          }
        }
      )
    },

    /** Extended margins the whole account together, so the mode is always cross. */
    getMarketSettings(
      params: ProviderGetMarketSettingsParams,
      opts?: SDKRequestOptions
    ): Promise<MarketSettings> {
      const { marketId, categoryId } = params.market
      if (categoryId !== EXTENDED_PROVIDER_KEY) {
        throw venueError(
          PerpsErrorCode.ValidationError,
          `Extended market '${marketId}' in category '${categoryId}' is not a perps market`
        )
      }
      return withCredentials(
        params.address,
        dataRead('market settings read'),
        async ({ apiKey }) => {
          const rows = await apiClient(opts).send<ExtendedLeverage[]>(
            'GET',
            `/api/v1/user/leverage?market=${encodeURIComponent(marketId)}`,
            { apiKey }
          )
          const row = rows.find((leverage) => leverage.market === marketId)
          const leverage =
            row === undefined
              ? undefined
              : unknownToDecimalString(
                  row.leverage,
                  'leverage',
                  EXTENDED_PROVIDER_KEY
                )
          if (
            leverage === undefined ||
            !isDecimalStringGreaterThan(leverage, '0')
          ) {
            throw venueError(
              PerpsErrorCode.SDKError,
              `Extended returned no positive leverage for market '${marketId}'`
            )
          }
          return { marginMode: MarginMode.CROSS, leverage }
        }
      )
    },

    getOrders(
      params: ProviderGetOrdersParams,
      opts?: SDKRequestOptions
    ): Promise<OrdersResponse> {
      return withCredentials(
        params.address,
        dataRead('orders read'),
        async ({ apiKey }) => {
          const statuses =
            params.statuses === undefined ? undefined : new Set(params.statuses)
          const wantsActive =
            statuses === undefined ||
            [...statuses].some((status) => ACTIVE_ORDER_STATUSES.has(status))
          const wantsClosed =
            statuses === undefined ||
            [...statuses].some((status) => !ACTIVE_ORDER_STATUSES.has(status))
          const market =
            params.marketId === undefined
              ? ''
              : `?market=${encodeURIComponent(params.marketId)}`
          const client = apiClient(opts)
          // Open orders have no pagination, so they come on the first page only.
          const [open, history] = await Promise.all([
            wantsActive && params.cursor === undefined
              ? client.send<ExtendedOrder[]>(
                  'GET',
                  `/api/v1/user/orders${market}`,
                  { apiKey }
                )
              : Promise.resolve([]),
            wantsClosed
              ? client.getPage<ExtendedOrder>(
                  '/api/v1/user/orders/history',
                  apiKey,
                  {
                    market: params.marketId,
                    cursor: params.cursor,
                    limit: params.limit,
                  }
                )
              : Promise.resolve({ data: [], cursor: undefined }),
            marketRegistry().sync(),
          ])
          const orders = [...open, ...history.data]
            .flatMap((row) => {
              const display = marketDisplay(row.market)
              return display === undefined ? [] : mapOrderOrDrop(row, display)
            })
            .filter(
              (order) => statuses === undefined || statuses.has(order.status)
            )
          return {
            provider: EXTENDED_PROVIDER_KEY,
            orders,
            pagination: {
              limit: params.limit ?? orders.length,
              hasMore: history.cursor !== undefined,
              ...(history.cursor === undefined
                ? {}
                : { cursor: history.cursor }),
            },
          }
        }
      )
    },

    getOrder(
      params: ProviderGetOrderParams,
      opts?: SDKRequestOptions
    ): Promise<Order> {
      return withCredentials(
        params.address,
        dataRead('order lookup'),
        async ({ apiKey }) => {
          const [row] = await Promise.all([
            apiClient(opts)
              .send<ExtendedOrder>(
                'GET',
                `/api/v1/user/orders/${encodeURIComponent(params.id)}`,
                { apiKey }
              )
              .catch((error: unknown) => {
                if (
                  error instanceof ExtendedApiError &&
                  error.httpStatus === 404
                ) {
                  throw venueError(
                    PerpsErrorCode.OrderNotFound,
                    `Extended order ${params.id} not found`
                  )
                }
                throw error
              }),
            marketRegistry().sync(),
          ])
          const [order] = mapOrder(
            row,
            toMarketDisplay(marketRegistry().require(row.market))
          )
          return order
        }
      )
    },

    getFills(
      params: ProviderGetFillsParams,
      opts?: SDKRequestOptions
    ): Promise<FillsResponse> {
      return withCredentials(
        params.address,
        dataRead('fills read'),
        async ({ apiKey }) => {
          const [page] = await Promise.all([
            apiClient(opts).getPage<ExtendedTrade>(
              '/api/v1/user/trades',
              apiKey,
              {
                cursor: params.cursor,
                limit: params.limit,
              }
            ),
            marketRegistry().sync(),
          ])
          const items = page.data
            .flatMap((trade) => {
              const display = marketDisplay(trade.market)
              return display === undefined ? [] : [mapFill(trade, display)]
            })
            .filter((fill) => {
              const time = Date.parse(fill.createdAt)
              return (
                (params.startTime === undefined || time >= params.startTime) &&
                (params.endTime === undefined || time <= params.endTime)
              )
            })
          return {
            provider: EXTENDED_PROVIDER_KEY,
            items,
            pagination: {
              limit: params.limit ?? items.length,
              hasMore: page.cursor !== undefined,
              ...(page.cursor === undefined ? {} : { cursor: page.cursor }),
            },
          }
        }
      )
    },

    /** Deposits and withdrawals. Other activity types give an empty page. */
    getActivity(
      params: ProviderGetActivityParams,
      opts?: SDKRequestOptions
    ): Promise<ActivitiesResponse> {
      return withCredentials(
        params.address,
        dataRead('activity read'),
        async ({ apiKey }) => {
          const wanted = (type: ActivityType) =>
            params.type === undefined || params.type.includes(type)
          if (
            !wanted(ActivityType.DEPOSIT) &&
            !wanted(ActivityType.WITHDRAWAL)
          ) {
            return {
              provider: EXTENDED_PROVIDER_KEY,
              items: [],
              pagination: { limit: params.limit ?? 0, hasMore: false },
            }
          }
          const [{ providers }, page] = await Promise.all([
            getProviders(requireClient(), opts),
            apiClient(opts).getPage<ExtendedAssetOperation>(
              '/api/v1/user/assetOperations',
              apiKey,
              { cursor: params.cursor, limit: params.limit }
            ),
          ])
          const collateral = requireExtendedCollateralAsset(providers)
          const items = page.data.flatMap((operation): ActivityItem[] => {
            const activity = mapAssetOperation(operation, collateral)
            if (activity === null || !wanted(activity.type)) {
              return []
            }
            const time = Date.parse(activity.timestamp)
            const inRange =
              (params.startTime === undefined || time >= params.startTime) &&
              (params.endTime === undefined || time <= params.endTime)
            return inRange ? [activity] : []
          })
          return {
            provider: EXTENDED_PROVIDER_KEY,
            items,
            pagination: {
              limit: params.limit ?? items.length,
              hasMore: page.cursor !== undefined,
              ...(page.cursor === undefined ? {} : { cursor: page.cursor }),
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
        EXTENDED_PROVIDER_KEY,
        params,
        EXTENDED_BASE_FEE_TIER,
        opts
      )
    },

    getAccountSummary(account: AccountResponse): AccountSummary {
      return getAccountSummary(account)
    },

    snapOrderPrice,

    snapOrderSize,

    calculateRoe,

    remarkPosition,

    isLeverageEqual: (requested, reported) => {
      if (
        !isDecimalStringGreaterThan(requested, '0') ||
        !isDecimalStringGreaterThan(reported.leverage, '0')
      ) {
        throw new PerpsError(
          PerpsErrorCode.ValidationError,
          'Leverage must be above zero'
        )
      }
      return compareDecimalStrings(requested, reported.leverage) === 0
    },

    triggerOrders: { modifyCanChangeType: false },

    estimateLiquidationPrice: estimateLiquidationPriceAtMarketRate,

    // Cross margin only: no position holds margin of its own.
    positionRemovableMargin: () => undefined,

    projectConfig(
      config: AccountConfig,
      setup: SetupAction[]
    ): AccountConfigSetting[] {
      return projectExtendedConfigSettings(config, setup)
    },

    /**
     * The backend writes the Stark key and the position into each settlement
     * it builds, so every action except the two setup steps sends them.
     */
    async resolveActionRequest(
      action: ActionType,
      address: Address
    ): Promise<ActionSignerContribution> {
      if (
        action === ActionType.CREATE_ACCOUNT ||
        action === ActionType.REGISTER_API_KEY
      ) {
        return {}
      }
      const credentials = await credentialStore.get(address)
      if (credentials === null) {
        throw venueError(
          PerpsErrorCode.SetupRequired,
          'Extended credentials are missing on this device. Run the Extended setup.'
        )
      }
      return {
        params: {
          starkKey: credentials.starkPublicKey,
          positionId: credentials.positionId,
        },
      }
    },

    signActions(
      method: SigningMethod,
      steps: ActionStep[],
      address: Address,
      ctx?: SignActionsContext
    ): Promise<SignActionsResult> {
      return extendedSignActions(
        {
          client: apiClient(),
          credentialStore,
          baseUrl: apiUrl,
          signingDomain: EXTENDED_SIGNING_DOMAIN,
          starkDomain: EXTENDED_MAINNET_STARK_DOMAIN,
        },
        method,
        steps,
        address,
        ctx
      )
    },

    // Extended refusing the API key means it is revoked: remove the
    // credentials so the setup step stages again.
    async onExecuteResults(
      address: Address,
      results: ActionResult[]
    ): Promise<undefined> {
      const unauthorized = results.some(
        (result) =>
          result.status === UserActionStatus.Failed &&
          result.errorCode === PerpsErrorCode.Unauthorized
      )
      if (unauthorized) {
        await credentialStore.remove(address)
      }
      return undefined
    },
  }
}

/**
 * Alias matching `@lifi/sdk`'s capitalised factory naming.
 *
 * @public
 */
export const Extended = extendedProvider
