import {
  getAsset as coreGetAsset,
  getAssets as coreGetAssets,
  getOhlcv as coreGetOhlcv,
  getOrderbook as coreGetOrderbook,
  getPrices as coreGetPrices,
  PerpsError,
  type PerpsProvider,
  type PerpsSDKClient,
  type ProviderGetAccountParams,
  type ProviderGetActivityParams,
  type ProviderGetAssetParams,
  type ProviderGetFillsParams,
  type ProviderGetOhlcvParams,
  type ProviderGetOrderbookParams,
  type ProviderGetOrderParams,
  type ProviderGetOrdersParams,
  type ProviderGetPositionsParams,
  type ProviderGetPricesParams,
  resolveRetryPolicy,
  type SatisfyClientSetupContext,
  type SDKRequestOptions,
  type SignActionsContext,
} from '@lifi/perps-sdk'
import type {
  AccountConfig,
  AccountConfigSetting,
  AccountResponse,
  AccountSummary,
  ActionStep,
  ActivitiesResponse,
  ActivityItem,
  Asset,
  AssetDisplay,
  AssetsResponse,
  Balance,
  FillsResponse,
  LighterAccountConfig,
  OhlcvResponse,
  OpenOrder,
  Order,
  OrderbookResponse,
  OrdersResponse,
  Position,
  PositionsResponse,
  PricesResponse,
  ProviderOption,
  ProviderSetup,
  SignedActionStep,
  SigningMethod,
  TriggerOrder,
} from '@lifi/perps-types'
import { ActionType, ActivityType, PerpsErrorCode } from '@lifi/perps-types'
import type { Address } from 'viem'
import { projectLighterConfigSettings } from './accountConfig.js'
import { summarizeLighterAccount } from './accountSummary.js'
import {
  DEFAULT_API_KEY_INDEX,
  DEFAULT_LIGHTER_REST_URL,
  DEFAULT_TRADES_LIMIT,
  LIGHTER_ALL_MARKETS_WILDCARD,
  LIGHTER_CODE_ACCOUNT_NOT_FOUND,
  LIGHTER_FEE_TICK_SCALE,
  LIGHTER_HISTORY_PAGE_SIZE,
  LIGHTER_PROVIDER_KEY,
} from './constants.js'
import { createAuthToken } from './signers/createAuthToken.js'
import type { LighterKeyStore } from './signers/LighterKeyStore.js'
import type { LighterReadOnlyTokenManagerOptions } from './signers/LighterReadOnlyTokenManager.js'
import {
  LighterReadOnlyTokenManager,
  walletClientSigner,
} from './signers/LighterReadOnlyTokenManager.js'
import type { LighterSigner } from './signers/LighterSigner.js'
import { lighterSignActions } from './signers/signActions.js'
import type {
  LtAccountLimits,
  LtDepositHistoryResponse,
  LtDetailedAccount,
  LtDetailedAccountPosition,
  LtLiquidationsResponse,
  LtOrdersResponse,
  LtPositionFundingsResponse,
  LtTradesResponse,
  LtTransferHistoryResponse,
  LtWithdrawHistoryResponse,
} from './types/index.js'
import {
  decodeActivityCursor,
  encodeActivityCursor,
  type LighterActivityCursor,
} from './utils/activityCursor.js'
import { LIGHTER_RETRY_DEFAULTS, LighterApiClient } from './utils/apiClient.js'
import {
  isTriggerType,
  mapFill,
  mapOrder,
  mapOrderDetail,
  mapPosition,
  mapTriggerOrder,
} from './utils/index.js'
import { LighterMarketRegistry } from './utils/markets.js'

const ZERO_FEE_TIER = { maker: '0', taker: '0' }

const tickToFeeString = (tick: number): string =>
  String(tick / LIGHTER_FEE_TICK_SCALE)

const projectFeeTier = (
  limits: LtAccountLimits
): { maker: string; taker: string } => ({
  maker: tickToFeeString(limits.current_maker_fee_tick),
  taker: tickToFeeString(limits.current_taker_fee_tick),
})

const lighterAsset = (symbol: string): AssetDisplay => ({
  assetId: symbol,
  market: LIGHTER_PROVIDER_KEY,
  displaySymbol: symbol,
  displayQuote: 'USDC',
})

const toIsoFromSeconds = (seconds: number): string =>
  new Date(seconds * 1000).toISOString()

const toIsoFromMs = (ms: number): string => new Date(ms).toISOString()

const orderCountFor = (p: LtDetailedAccountPosition): number =>
  (p.open_order_count ?? 0) +
  (p.pending_order_count ?? 0) +
  (p.position_tied_order_count ?? 0)

/**
 * Lighter `sendTx` returns a bare lowercase-hex tx hash (40 bytes → 80 hex
 * chars). `Order.order_id` is a different identifier the matching engine
 * assigns later. The strict 80-char shape lets `getOrder` route freshly
 * submitted IDs to the tx-hash branch without false positives.
 */
const TX_HASH_PATTERN = /^[0-9a-f]{80}$/

const INACTIVE_ORDERS_LOOKUP_LIMIT = 100

/**
 * Default expiry for the read-only token Lighter mints in
 * `satisfyClientSetup(APPROVE_READ_ONLY_TOKEN)`. 10 years — Lighter caps
 * read-only tokens at the venue's maximum, which is a multi-year horizon
 * for read-scope tokens.
 */
const DEFAULT_READ_ONLY_TOKEN_LIFETIME_SECONDS = 10 * 365 * 24 * 60 * 60

const LIGHTER_CLIENT_SETUP_ACTIONS: ReadonlySet<ActionType> = new Set([
  ActionType.APPROVE_READ_ONLY_TOKEN,
])

/**
 * Construction options for the Lighter {@link PerpsProvider} plugin.
 *
 * `restUrl` defaults to Lighter mainnet; pass a testnet URL or a self-hosted
 * mirror to override.
 *
 * Auth-token resolution order for the auth-gated reads:
 *   1. Per-call `options.lighterAuthToken`
 *   2. Constructor `authToken` (string or async factory)
 *   3. Persisted long-lived read-only token (via `readOnlyTokenOptions`'s
 *      storage), keyed on the resolved Lighter `accountIndex`
 *   4. Fresh 1h mint via the WASM signer + the user's registered API key
 *      from `keyStore`
 *
 * When none of these yields a token the auth-gated reads degrade gracefully:
 *   - `getOrders`, `getActivity` return empty results (mirrors backend behaviour)
 *   - `getOrder` throws `Unauthorized`
 *   - `getAccount` returns zero fee tier rather than failing
 *
 * Write actions (`signActions` for the WASM_BLOB / EVM_TX arms) require
 * `signer` and `keyStore` to be supplied.
 */
export interface LighterProviderOptions {
  /** Lighter REST base URL. Defaults to mainnet. */
  restUrl?: string
  /** Pre-minted Lighter read-only bearer. */
  authToken?: string | (() => string | Promise<string>)
  /**
   * WASM signer instance. Required for `signActions` (write actions) and
   * for on-demand auth-token minting from the user's API key. The default
   * configuration loads the WASM blob shipped with this package.
   */
  signer?: LighterSigner
  /**
   * Store for the user's per-address Lighter API keypair. Required for
   * `signActions` (write actions) and for on-demand auth-token minting.
   */
  keyStore?: LighterKeyStore
  /**
   * Options for the long-lived read-only token manager. The token (when
   * stored) is the preferred auth token for reads — Lighter never expires
   * it before the recorded `expiry`.
   */
  readOnlyTokenOptions?: LighterReadOnlyTokenManagerOptions
  /** Token lifetime for on-demand standard-token mints (Lighter caps at 8h). Default 1h. */
  tokenLifetimeSeconds?: number
  /** Re-mint when the cached standard token's remaining life is below this. Default 60s. */
  tokenRenewBufferSeconds?: number
  /** Time-to-live for `orderBookDetails`/`tokenlist`/`assetDetails` cache. */
  metadataTtlMs?: number
  /** Time-to-live for the funding-rates cache. */
  fundingsTtlMs?: number
}

interface MintedToken {
  token: string
  /** Unix seconds — re-mint when `Date.now()/1000 + renewBuffer >= expiresAt`. */
  expiresAt: number
}

/**
 * Lighter provider plugin extended with a public `resolveAuthToken` so the
 * WS layer can share the same token-resolution closure that the read methods
 * use internally. The base {@link PerpsProvider} contract stays
 * provider-agnostic — this extension is opt-in for callers that explicitly
 * type against it.
 */
export interface LighterPerpsProvider extends PerpsProvider {
  /**
   * Resolve a Lighter auth token for `address` using the same priority chain
   * as the plugin's read methods: per-call override (n/a here) → constructor
   * `authToken` → stored long-lived read-only token → freshly minted 1h token
   * via the WASM signer + registered API key. Returns `undefined` when no
   * source can produce a token — callers degrade gracefully.
   */
  resolveAuthToken(address: Address): Promise<string | undefined>
}

/**
 * Lighter provider plugin factory. Returns an object implementing
 * {@link PerpsProvider}, mirroring the `EthereumProvider()` / `hyperliquidProvider()`
 * shape used by the rest of the LI.FI SDK family.
 *
 * Read functions call Lighter's REST API directly with no LI.FI backend hop.
 * Auth-gated reads use the user-minted read-only token from
 * `readOnlyTokenOptions`'s storage, a pre-minted token on `authToken`, or
 * an on-demand mint via the bundled WASM signer + the user's registered
 * API key from `keyStore`.
 *
 * Write actions (`WASM_BLOB` and `EVM_TX` signing) are dispatched via
 * `signActions` — `PerpsClient.execute` delegates those arms here.
 */
export const lighterProvider = (
  options: LighterProviderOptions = {}
): LighterPerpsProvider => {
  const restUrl = options.restUrl ?? DEFAULT_LIGHTER_REST_URL
  const authTokenSource: (() => string | Promise<string>) | undefined =
    typeof options.authToken === 'function'
      ? options.authToken
      : options.authToken !== undefined
        ? () => options.authToken as string
        : undefined
  const signer = options.signer
  const keyStore = options.keyStore
  const readOnlyTokenManager =
    options.readOnlyTokenOptions !== undefined
      ? new LighterReadOnlyTokenManager(options.readOnlyTokenOptions)
      : undefined
  const tokenLifetimeSeconds = options.tokenLifetimeSeconds ?? 60 * 60
  const tokenRenewBufferSeconds = options.tokenRenewBufferSeconds ?? 60
  const registry = new LighterMarketRegistry(new LighterApiClient(restUrl), {
    metadataTtlMs: options.metadataTtlMs,
    fundingsTtlMs: options.fundingsTtlMs,
  })
  const mintedTokenByAddress: Map<string, MintedToken> = new Map()

  // ---------------------------------------------------------------------------
  // Internal helpers — closed-over state replaces the class's `this.X` access.
  // ---------------------------------------------------------------------------

  const apiClient = (
    sdkClient?: PerpsSDKClient,
    opts?: SDKRequestOptions
  ): LighterApiClient =>
    new LighterApiClient(restUrl, {
      signal: opts?.signal,
      policy: sdkClient
        ? resolveRetryPolicy(
            LIGHTER_RETRY_DEFAULTS,
            sdkClient.config.retry,
            LIGHTER_PROVIDER_KEY
          )
        : undefined,
      fetchImpl: sdkClient?.config.fetch,
    })

  const mintViaSigner = async (
    address: Address,
    apiKeyPrivateKey: string,
    indices: { apiKeyIndex: number; accountIndex: number }
  ): Promise<string> => {
    if (signer === undefined) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'lighterProvider: mintViaSigner called without a configured signer.'
      )
    }
    const cacheKey = address.toLowerCase()
    const nowSec = Math.floor(Date.now() / 1000)
    const cached = mintedTokenByAddress.get(cacheKey)
    if (
      cached !== undefined &&
      cached.expiresAt - nowSec > tokenRenewBufferSeconds
    ) {
      return cached.token
    }
    const token = await createAuthToken({
      signer,
      apiKey: {
        apiKeyPrivateKey,
        apiKeyIndex: indices.apiKeyIndex,
        accountIndex: indices.accountIndex,
      },
      lifetimeSeconds: tokenLifetimeSeconds,
    })
    const expiresAt = nowSec + tokenLifetimeSeconds
    mintedTokenByAddress.set(cacheKey, { token, expiresAt })
    return token
  }

  /**
   * Resolve the bearer token to use on auth-gated calls. Per-call override
   * (`options.lighterAuthToken`) wins, then a constructor-supplied token,
   * then a stored long-lived read-only token (when wired with a
   * `readOnlyTokenOptions` storage and the address is known), then a
   * freshly minted 1h token via the WASM signer + registered API key.
   * Returns `undefined` when no source can produce a token — auth-gated
   * reads degrade gracefully.
   */
  const resolveAuthToken = async (
    opts: SDKRequestOptions | undefined,
    address?: Address
  ): Promise<string | undefined> => {
    if (opts?.lighterAuthToken !== undefined) {
      return opts.lighterAuthToken
    }
    if (authTokenSource !== undefined) {
      return authTokenSource()
    }
    if (address !== undefined && keyStore !== undefined) {
      const apiKey = await keyStore.get(address)
      if (apiKey === null) {
        return undefined
      }
      if (readOnlyTokenManager !== undefined) {
        const stored = await readOnlyTokenManager.get(
          address,
          apiKey.accountIndex
        )
        if (stored !== undefined) {
          return stored.token
        }
      }
      if (signer !== undefined) {
        return mintViaSigner(address, apiKey.apiKeyPrivateKey, {
          apiKeyIndex: apiKey.apiKeyIndex,
          accountIndex: apiKey.accountIndex,
        })
      }
    }
    return undefined
  }

  const fetchDetailedAccount = async (
    client: LighterApiClient,
    address: Address
  ): Promise<LtDetailedAccount> => {
    const { status, data } = await client.getRaw<{
      code: number
      accounts?: LtDetailedAccount[]
      message?: string
    }>('/api/v1/account', { by: 'l1_address', value: address })

    if (status === 400 && data?.code === LIGHTER_CODE_ACCOUNT_NOT_FOUND) {
      throw new PerpsError(
        PerpsErrorCode.AccountNotFound,
        `No Lighter account found for address: ${address}`
      )
    }

    if (status < 200 || status >= 300) {
      throw new PerpsError(
        PerpsErrorCode.ThirdPartyError,
        `Lighter account request failed: ${status} — ${JSON.stringify(data).slice(0, 200)}`
      )
    }

    const accounts = data?.accounts
    if (accounts === undefined || accounts.length === 0) {
      throw new PerpsError(
        PerpsErrorCode.AccountNotFound,
        `No Lighter account found for address: ${address}`
      )
    }
    return accounts[0]
  }

  const fetchRegisteredApiKey = async (
    client: LighterApiClient,
    accountIndex: number,
    apiKeyIndex: number
  ): Promise<{ api_key_index: number } | undefined> => {
    const response = await client.get<{
      code: number
      api_keys: Array<{ api_key_index: number }>
    }>('/api/v1/apikeys', { account_index: accountIndex })
    return response.api_keys?.find((k) => k.api_key_index === apiKeyIndex)
  }

  const fetchAccountLimits = (
    client: LighterApiClient,
    accountIndex: number,
    authToken: string
  ): Promise<LtAccountLimits> =>
    client.getAuthed<LtAccountLimits>('/api/v1/accountLimits', authToken, {
      account_index: accountIndex,
    })

  const fetchActiveOrdersForMarket = (
    client: LighterApiClient,
    authToken: string,
    accountIndex: number,
    marketId: number
  ): Promise<LtOrdersResponse> =>
    client.getAuthed<LtOrdersResponse>(
      '/api/v1/accountActiveOrders',
      authToken,
      { account_index: accountIndex, market_id: marketId }
    )

  const deriveOrderBearingMarketIds = (account: LtDetailedAccount): number[] =>
    account.positions
      .filter((p) => orderCountFor(p) > 0)
      .map((p) => p.market_id)

  const fetchAllHistory = async (
    client: LighterApiClient,
    token: string,
    accountIndex: number,
    l1Address: string,
    requested: ActivityType[] | undefined,
    inputCursor: LighterActivityCursor | undefined
  ): Promise<{
    deposits: LtDepositHistoryResponse
    withdraws: LtWithdrawHistoryResponse
    fundings: LtPositionFundingsResponse
    liquidations: LtLiquidationsResponse
    transfers: LtTransferHistoryResponse
  }> => {
    const wantsType = (t: ActivityType): boolean =>
      requested === undefined || requested.includes(t)

    const shouldFetch = (
      t: ActivityType,
      key: keyof LighterActivityCursor
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

    const cursorParam = (
      key: keyof LighterActivityCursor
    ): { cursor: string } | Record<string, never> => {
      const v = inputCursor?.[key]
      return typeof v === 'string' && v.length > 0 ? { cursor: v } : {}
    }

    const empty = <T>(payload: T): T => payload

    const [deposits, withdraws, fundings, liquidations, transfers] =
      await Promise.all([
        shouldFetch(ActivityType.DEPOSIT, 'deposits')
          ? client.getAuthed<LtDepositHistoryResponse>(
              '/api/v1/deposit/history',
              token,
              {
                account_index: accountIndex,
                l1_address: l1Address,
                ...cursorParam('deposits'),
              }
            )
          : Promise.resolve(empty({ code: 0, deposits: [] })),
        shouldFetch(ActivityType.WITHDRAWAL, 'withdraws')
          ? client.getAuthed<LtWithdrawHistoryResponse>(
              '/api/v1/withdraw/history',
              token,
              { account_index: accountIndex, ...cursorParam('withdraws') }
            )
          : Promise.resolve(empty({ code: 0, withdraws: [] })),
        shouldFetch(ActivityType.FUNDING, 'fundings')
          ? client.getAuthed<LtPositionFundingsResponse>(
              '/api/v1/positionFunding',
              token,
              {
                account_index: accountIndex,
                market_id: LIGHTER_ALL_MARKETS_WILDCARD,
                limit: LIGHTER_HISTORY_PAGE_SIZE,
                ...cursorParam('fundings'),
              }
            )
          : Promise.resolve(empty({ code: 0, position_fundings: [] })),
        shouldFetch(ActivityType.LIQUIDATION, 'liquidations')
          ? client.getAuthed<LtLiquidationsResponse>(
              '/api/v1/liquidations',
              token,
              {
                account_index: accountIndex,
                market_id: LIGHTER_ALL_MARKETS_WILDCARD,
                limit: LIGHTER_HISTORY_PAGE_SIZE,
                ...cursorParam('liquidations'),
              }
            )
          : Promise.resolve(empty({ code: 0, liquidations: [] })),
        shouldFetch(ActivityType.TRANSFER, 'transfers')
          ? client.getAuthed<LtTransferHistoryResponse>(
              '/api/v1/transfer/history',
              token,
              { account_index: accountIndex, ...cursorParam('transfers') }
            )
          : Promise.resolve(empty({ code: 0, transfers: [] })),
      ])

    return { deposits, withdraws, fundings, liquidations, transfers }
  }

  // ---------------------------------------------------------------------------
  // PerpsProvider — public surface
  // ---------------------------------------------------------------------------

  return {
    type: LIGHTER_PROVIDER_KEY,

    resolveAuthToken(address: Address): Promise<string | undefined> {
      return resolveAuthToken(undefined, address)
    },

    async getAccount(
      sdkClient: PerpsSDKClient,
      params: ProviderGetAccountParams,
      opts?: SDKRequestOptions
    ): Promise<AccountResponse> {
      const client = apiClient(sdkClient, opts)
      const account = await fetchDetailedAccount(client, params.address)
      const token = await resolveAuthToken(opts, params.address)

      const [symbolLookup, registeredKey, limitsResult] = await Promise.all([
        registry.marketIdToSymbol(),
        fetchRegisteredApiKey(client, account.index, DEFAULT_API_KEY_INDEX),
        token === undefined
          ? Promise.resolve(undefined)
          : fetchAccountLimits(client, account.index, token).catch(
              () => undefined
            ),
      ])

      const positions: Position[] = account.positions
        .filter((p) => Number.parseFloat(p.position) !== 0)
        .map((p) => mapPosition(p, symbolLookup.get(p.market_id) ?? p.symbol))

      const totalMarginUsed = positions.reduce(
        (sum, p) => sum + Number.parseFloat(p.marginUsed),
        0
      )
      const totalUnrealizedPnl = positions.reduce(
        (sum, p) => sum + Number.parseFloat(p.unrealizedPnl),
        0
      )

      const balances: Record<string, Balance[]> = {
        [LIGHTER_PROVIDER_KEY]: [
          { currency: 'USDC', amount: account.collateral },
        ],
      }
      if (account.assets.length > 0) {
        balances.spot = account.assets.map((a) => ({
          currency: a.symbol,
          amount: a.balance,
        }))
      }

      const config: LighterAccountConfig = {
        provider: LIGHTER_PROVIDER_KEY,
        accountIndex: account.index,
        apiKeyIndex: DEFAULT_API_KEY_INDEX,
        apiKeyRegistered: registeredKey !== undefined,
        accountType: account.account_type,
        readOnlyTokenApproved: false,
      }

      return {
        provider: LIGHTER_PROVIDER_KEY,
        address: params.address,
        balances,
        marginUsed: totalMarginUsed.toString(),
        unrealizedPnl: totalUnrealizedPnl.toString(),
        feeTier:
          limitsResult === undefined
            ? ZERO_FEE_TIER
            : projectFeeTier(limitsResult),
        config,
      }
    },

    async getPositions(
      sdkClient: PerpsSDKClient,
      params: ProviderGetPositionsParams,
      opts?: SDKRequestOptions
    ): Promise<PositionsResponse> {
      const client = apiClient(sdkClient, opts)
      const account = await fetchDetailedAccount(client, params.address)
      const symbolLookup = await registry.marketIdToSymbol()

      let positions: Position[] = account.positions
        .filter((p) => Number.parseFloat(p.position) !== 0)
        .map((p) => mapPosition(p, symbolLookup.get(p.market_id) ?? p.symbol))

      if (params.symbol !== undefined) {
        positions = positions.filter((p) => p.asset.assetId === params.symbol)
      }

      return {
        provider: LIGHTER_PROVIDER_KEY,
        positions,
        pagination: { limit: params.limit ?? positions.length, hasMore: false },
      }
    },

    async getOrders(
      sdkClient: PerpsSDKClient,
      params: ProviderGetOrdersParams,
      opts?: SDKRequestOptions
    ): Promise<OrdersResponse> {
      const token = await resolveAuthToken(opts, params.address)
      if (token === undefined) {
        return {
          provider: LIGHTER_PROVIDER_KEY,
          openOrders: [],
          triggerOrders: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }
      }

      const client = apiClient(sdkClient, opts)
      const [account, symbolLookup] = await Promise.all([
        fetchDetailedAccount(client, params.address),
        registry.marketIdToSymbol(),
      ])

      const marketIds =
        params.symbol === undefined
          ? deriveOrderBearingMarketIds(account)
          : [await registry.resolveMarketId(params.symbol)]

      const responses = await Promise.all(
        marketIds.map((id) =>
          fetchActiveOrdersForMarket(client, token, account.index, id)
        )
      )

      const openOrders: OpenOrder[] = []
      const triggerOrders: TriggerOrder[] = []
      for (const response of responses) {
        for (const raw of response.orders) {
          const symbol = symbolLookup.get(raw.market_index) ?? ''
          const mapped = mapOrder(raw, symbol)
          if (isTriggerType(mapped.type)) {
            triggerOrders.push(mapTriggerOrder(raw, symbol))
          } else {
            openOrders.push(mapped)
          }
        }
      }

      const total = openOrders.length + triggerOrders.length
      const limit = params.limit ?? total
      return {
        provider: LIGHTER_PROVIDER_KEY,
        openOrders,
        triggerOrders,
        pagination: { limit, hasMore: total > limit },
      }
    },

    async getOrder(
      sdkClient: PerpsSDKClient,
      params: ProviderGetOrderParams,
      opts?: SDKRequestOptions
    ): Promise<Order> {
      const token = await resolveAuthToken(opts, params.address)
      if (token === undefined) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          'Lighter order lookup requires an auth token. Pass `authToken` to ' +
            'lighterProvider, register an API key + signer for on-demand mints, or ' +
            'forward `options.lighterAuthToken` on the call.'
        )
      }

      const client = apiClient(sdkClient, opts)
      const [account, symbolLookup] = await Promise.all([
        fetchDetailedAccount(client, params.address),
        registry.marketIdToSymbol(),
      ])

      // Native `Order.order_id` route only. A tx-hash route would require
      // mapping the caller's executeAction tx hash → wasm nonce → matching
      // order, which the LI.FI backend did via its `UserAction` table; the SDK
      // has no equivalent persistence, so we refuse rather than mis-resolve.
      if (TX_HASH_PATTERN.test(params.id)) {
        throw new PerpsError(
          PerpsErrorCode.OrderNotFound,
          `Lighter order id "${params.id}" looks like a tx hash. The SDK ` +
            `resolves orders by Lighter \`order_id\` only — surface the order_id ` +
            `from the orderUpdates / fills WS stream and pass it here.`
        )
      }
      const predicate: (o: { order_id: string }) => boolean = (o) =>
        o.order_id === params.id

      const marketIds = deriveOrderBearingMarketIds(account)
      const activeResponses = await Promise.all(
        marketIds.map((id) =>
          fetchActiveOrdersForMarket(client, token, account.index, id)
        )
      )

      for (const response of activeResponses) {
        const hit = response.orders.find(predicate as (o: unknown) => boolean)
        if (hit !== undefined) {
          return mapOrderDetail(hit, symbolLookup.get(hit.market_index) ?? '')
        }
      }

      const inactive = await client.getAuthed<LtOrdersResponse>(
        '/api/v1/accountInactiveOrders',
        token,
        {
          account_index: account.index,
          market_id: LIGHTER_ALL_MARKETS_WILDCARD,
          limit: INACTIVE_ORDERS_LOOKUP_LIMIT,
        }
      )
      const hit = inactive.orders.find(predicate as (o: unknown) => boolean)
      if (hit !== undefined) {
        return mapOrderDetail(hit, symbolLookup.get(hit.market_index) ?? '')
      }

      throw new PerpsError(
        PerpsErrorCode.OrderNotFound,
        `Lighter order ${params.id} not found for ${params.address}`
      )
    },

    async getFills(
      sdkClient: PerpsSDKClient,
      params: ProviderGetFillsParams,
      opts?: SDKRequestOptions
    ): Promise<FillsResponse> {
      const client = apiClient(sdkClient, opts)
      const [account, symbolLookup, token] = await Promise.all([
        fetchDetailedAccount(client, params.address),
        registry.marketIdToSymbol(),
        resolveAuthToken(opts, params.address),
      ])

      const queryParams: Record<string, string | number | boolean> = {
        account_index: account.index,
        sort_by: 'timestamp',
        sort_dir: 'desc',
        limit: params.limit ?? DEFAULT_TRADES_LIMIT,
      }
      if (params.cursor !== undefined) {
        queryParams.cursor = params.cursor
      }

      const response =
        token !== undefined && token.length > 0
          ? await client.getAuthed<LtTradesResponse>(
              '/api/v1/trades',
              token,
              queryParams
            )
          : await client.get<LtTradesResponse>('/api/v1/trades', queryParams)

      const items = response.trades.map((t) =>
        mapFill(
          t,
          account.index,
          symbolLookup.get(t.market_id) ?? `market_${t.market_id}`
        )
      )

      return {
        provider: LIGHTER_PROVIDER_KEY,
        items,
        pagination: {
          limit: params.limit ?? items.length,
          hasMore: (response.next_cursor ?? '') !== '',
          cursor: response.next_cursor || undefined,
        },
      }
    },

    async getActivity(
      sdkClient: PerpsSDKClient,
      params: ProviderGetActivityParams,
      opts?: SDKRequestOptions
    ): Promise<ActivitiesResponse> {
      const token = await resolveAuthToken(opts, params.address)
      if (token === undefined) {
        return {
          provider: LIGHTER_PROVIDER_KEY,
          items: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }
      }

      const inputCursor = decodeActivityCursor(params.cursor)
      const client = apiClient(sdkClient, opts)
      const account = await fetchDetailedAccount(client, params.address)
      const [history, marketLookup, assetLookup] = await Promise.all([
        fetchAllHistory(
          client,
          token,
          account.index,
          params.address,
          params.type,
          inputCursor
        ),
        registry.marketIdToSymbol(),
        registry.assetIdToSymbol(),
      ])

      const items: ActivityItem[] = [
        ...history.deposits.deposits.map(
          (d): ActivityItem => ({
            id: d.id,
            provider: LIGHTER_PROVIDER_KEY,
            timestamp: toIsoFromMs(d.timestamp),
            type: ActivityType.DEPOSIT,
            amount: d.amount,
          })
        ),
        ...history.withdraws.withdraws.map(
          (w): ActivityItem => ({
            id: w.id,
            provider: LIGHTER_PROVIDER_KEY,
            timestamp: toIsoFromMs(w.timestamp),
            type: ActivityType.WITHDRAWAL,
            amount: w.amount,
            fee: '0',
          })
        ),
        ...history.fundings.position_fundings.map(
          (f): ActivityItem => ({
            id: `funding-${f.funding_id}`,
            provider: LIGHTER_PROVIDER_KEY,
            timestamp: toIsoFromSeconds(f.timestamp),
            type: ActivityType.FUNDING,
            asset: lighterAsset(marketLookup.get(f.market_id) ?? ''),
            amount: f.change,
            positionSize: f.position_size,
            fundingRate: f.rate,
          })
        ),
        ...history.liquidations.liquidations.map(
          (l): ActivityItem => ({
            id: `liquidation-${l.id}`,
            provider: LIGHTER_PROVIDER_KEY,
            timestamp: toIsoFromMs(l.executed_at),
            type: ActivityType.LIQUIDATION,
            liquidatedNotionalPosition: '0',
            accountValue: '0',
            leverageType: l.type,
            liquidatedPositions: [
              {
                asset: lighterAsset(marketLookup.get(l.market_id) ?? ''),
                size: '0',
              },
            ],
          })
        ),
        ...history.transfers.transfers.map((t): ActivityItem => {
          const direction: 'IN' | 'OUT' =
            t.from_account_index === account.index ? 'OUT' : 'IN'
          const counterpartyAccountIndex =
            direction === 'OUT' ? t.to_account_index : t.from_account_index
          return {
            id: t.id,
            provider: LIGHTER_PROVIDER_KEY,
            timestamp: toIsoFromMs(t.timestamp),
            type: ActivityType.TRANSFER,
            direction,
            counterpartyAccountIndex,
            asset: assetLookup.get(t.asset_id) ?? String(t.asset_id),
            amount: t.amount,
            meta: {
              transferType: t.type,
              txHash: t.tx_hash,
              fromRoute: t.from_route,
              toRoute: t.to_route,
              fee: t.fee,
            },
          }
        }),
      ]

      const filtered = items.filter((it) => {
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

      const nextCursorEnvelope: LighterActivityCursor = {
        deposits: history.deposits.cursor,
        withdraws: history.withdraws.cursor,
        fundings: history.fundings.next_cursor,
        liquidations: history.liquidations.next_cursor,
        transfers: history.transfers.cursor,
      }
      const responseCursor = encodeActivityCursor(nextCursorEnvelope)
      const hasMore = responseCursor !== undefined

      const limit = params.limit ?? filtered.length
      return {
        provider: LIGHTER_PROVIDER_KEY,
        items: filtered.slice(0, limit),
        pagination: {
          limit,
          hasMore,
          ...(responseCursor === undefined ? {} : { cursor: responseCursor }),
        },
      }
    },

    // Public/shared data routes through the LI.FI backend — Valkey-cached
    // server-side so one fetch serves every client. No direct Lighter call here.
    getAsset: (
      client: PerpsSDKClient,
      params: ProviderGetAssetParams,
      opts?: SDKRequestOptions
    ): Promise<Asset> =>
      coreGetAsset(
        client,
        { provider: LIGHTER_PROVIDER_KEY, symbol: params.symbol },
        opts
      ),

    getAssets: (
      client: PerpsSDKClient,
      opts?: SDKRequestOptions
    ): Promise<AssetsResponse> =>
      coreGetAssets(client, { provider: LIGHTER_PROVIDER_KEY }, opts),

    getPrices: (
      client: PerpsSDKClient,
      params: ProviderGetPricesParams,
      opts?: SDKRequestOptions
    ): Promise<PricesResponse> =>
      coreGetPrices(
        client,
        { provider: LIGHTER_PROVIDER_KEY, symbols: params.symbols },
        opts
      ),

    getOhlcv: (
      client: PerpsSDKClient,
      params: ProviderGetOhlcvParams,
      opts?: SDKRequestOptions
    ): Promise<OhlcvResponse> =>
      coreGetOhlcv(
        client,
        {
          provider: LIGHTER_PROVIDER_KEY,
          symbol: params.symbol,
          interval: params.interval,
          startTime: params.startTime,
          endTime: params.endTime,
          limit: params.limit,
        },
        opts
      ),

    getOrderbook: (
      client: PerpsSDKClient,
      params: ProviderGetOrderbookParams,
      opts?: SDKRequestOptions
    ): Promise<OrderbookResponse> =>
      coreGetOrderbook(
        client,
        {
          provider: LIGHTER_PROVIDER_KEY,
          symbol: params.symbol,
          depth: params.depth,
        },
        opts
      ),

    projectConfig(
      config: AccountConfig,
      setup: ProviderSetup[],
      options: ProviderOption[]
    ): AccountConfigSetting[] {
      if (config.provider !== LIGHTER_PROVIDER_KEY) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          `lighterProvider.projectConfig received config for provider ` +
            `'${config.provider}'.`
        )
      }
      return projectLighterConfigSettings(config, setup, options)
    },

    summarize(
      account: AccountResponse,
      positions: Position[],
      prices: Record<string, string>,
      assets?: Asset[],
      collateralCurrencies?: ReadonlySet<string>
    ): AccountSummary {
      return summarizeLighterAccount(
        account,
        positions,
        prices,
        assets,
        collateralCurrencies
      )
    },

    clientSetupActions: LIGHTER_CLIENT_SETUP_ACTIONS,

    async satisfyClientSetup(
      action: ActionType,
      sdkClient: PerpsSDKClient,
      ctx: SatisfyClientSetupContext
    ): Promise<void> {
      if (action !== ActionType.APPROVE_READ_ONLY_TOKEN) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          `lighterProvider.satisfyClientSetup does not handle action '${action}'.`
        )
      }
      if (readOnlyTokenManager === undefined) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          'lighterProvider.satisfyClientSetup(APPROVE_READ_ONLY_TOKEN) requires ' +
            '`readOnlyTokenOptions` to be configured.'
        )
      }
      if (ctx.signer === undefined) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          'lighterProvider.satisfyClientSetup(APPROVE_READ_ONLY_TOKEN) requires ' +
            'a wallet signer. Call PerpsClient.setSigner(walletClient) first.'
        )
      }

      const inputAccountIndex = (
        ctx.params as { accountIndex?: number } | undefined
      )?.accountIndex
      const accountIndex =
        typeof inputAccountIndex === 'number'
          ? inputAccountIndex
          : (await fetchDetailedAccount(apiClient(sdkClient), ctx.address))
              .index

      const inputExpiry = (ctx.params as { expirySeconds?: number } | undefined)
        ?.expirySeconds
      const expirySeconds =
        typeof inputExpiry === 'number'
          ? inputExpiry
          : Math.floor(Date.now() / 1000) +
            DEFAULT_READ_ONLY_TOKEN_LIFETIME_SECONDS

      await readOnlyTokenManager.approve(walletClientSigner(ctx.signer), {
        address: ctx.address,
        accountIndex,
        expirySeconds,
        scope: 'all',
      })
    },

    async signActions(
      method: SigningMethod,
      steps: ActionStep[],
      address: Address,
      ctx?: SignActionsContext
    ): Promise<SignedActionStep[]> {
      if (signer === undefined || keyStore === undefined) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          'lighterProvider.signActions requires `signer` and `keyStore` to be ' +
            'configured at construction.'
        )
      }
      const signerRef = signer
      const keyStoreRef = keyStore
      return lighterSignActions(
        {
          signer: signerRef,
          keyStore: keyStoreRef,
          resolveAccountIndex: async (addr) => {
            const apiKey = await keyStoreRef.get(addr)
            if (apiKey !== null) {
              return apiKey.accountIndex
            }
            const account = await fetchDetailedAccount(apiClient(), addr)
            return account.index
          },
        },
        method,
        steps,
        address,
        ctx
      )
    },
  }
}

/**
 * Alias matching `@lifi/sdk`'s capitalised factory naming (`EVM()`, `EthereumProvider()`).
 */
export const Lighter = lighterProvider
