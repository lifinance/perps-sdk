import {
  getAssets as coreGetAssets,
  getMarkets as coreGetMarkets,
  ExplorerChainId,
  explorerTxUrl,
  PerpsError,
  type PerpsProviderPlugin,
  type PerpsSDKClient,
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
} from '@lifi/perps-sdk'
import type {
  AccountConfig,
  AccountConfigSetting,
  AccountResponse,
  AccountSummary,
  ActionStep,
  ActivitiesResponse,
  ActivityItem,
  Balance,
  FillsResponse,
  LighterAccountConfig,
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
import { projectLighterConfigSettings } from './accountConfig.js'
import { summarizeLighterAccount } from './accountSummary.js'
import {
  DEFAULT_API_KEY_INDEX,
  DEFAULT_LIGHTER_REST_URL,
  DEFAULT_TRADES_LIMIT,
  LIGHTER_ALL_MARKETS_WILDCARD,
  LIGHTER_BASE_FEE_TIER,
  LIGHTER_FEE_TICK_SCALE,
  LIGHTER_HISTORY_PAGE_SIZE,
  LIGHTER_PROVIDER_KEY,
} from './constants.js'
import { createAuthToken } from './signers/createAuthToken.js'
import type { LighterKeyStore } from './signers/LighterKeyStore.js'
import type { LighterReadOnlyTokenManagerOptions } from './signers/LighterReadOnlyTokenManager.js'
import { LighterReadOnlyTokenManager } from './signers/LighterReadOnlyTokenManager.js'
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
import {
  LIGHTER_RETRY_DEFAULTS,
  LighterApiClient,
  LighterAuthRejectedError,
} from './utils/apiClient.js'
import type { LighterMarketMeta } from './utils/index.js'
import {
  classifyAndMapOrders,
  estimateLiquidationPrice,
  fetchDetailedAccount,
  formatOrderPrice,
  formatOrderSize,
  lighterAsset,
  mapFill,
  mapOpenPositions,
  mapOrderDetail,
  marketDisplay,
} from './utils/index.js'

const ZERO_FEE_TIER = { maker: '0', taker: '0' }

const tickToFeeString = (tick: number): string =>
  String(tick / LIGHTER_FEE_TICK_SCALE)

const projectFeeTier = (
  limits: LtAccountLimits
): { maker: string; taker: string } => ({
  maker: tickToFeeString(limits.current_maker_fee_tick),
  taker: tickToFeeString(limits.current_taker_fee_tick),
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
 * Expiry requested when the SDK lazily creates a Lighter read-only token for
 * authenticated reads. 10 years — Lighter caps read-only tokens at the
 * venue's maximum, so a single token covers the account's lifetime.
 */
const DEFAULT_READ_ONLY_TOKEN_LIFETIME_SECONDS = 10 * 365 * 24 * 60 * 60

/** Compare Lighter public keys irrespective of `0x` prefix / casing. */
const normalizeLighterPublicKey = (key: string): string =>
  key.replace(/^0x/i, '').toLowerCase()

/**
 * Construction options for the Lighter {@link PerpsProviderPlugin}.
 *
 * `restUrl` defaults to Lighter mainnet; pass a testnet URL or a self-hosted
 * mirror to override.
 *
 * Auth-token resolution order for the auth-gated reads:
 *   1. Per-call `options.lighterAuthToken`
 *   2. Constructor `authToken` (string or async factory)
 *   3. Persisted long-lived read-only token (via `readOnlyTokenOptions`'s
 *      storage), keyed on the resolved Lighter `accountIndex`
 *   4. Fresh 1h create via the WASM signer + the user's registered API key
 *      from `keyStore`
 *
 * When none of these yields a token the auth-gated reads degrade gracefully:
 *   - `getOrders`, `getActivity` return empty results (mirrors backend behaviour)
 *   - `getOrder` throws `Unauthorized`
 *   - `getAccount` returns zero fee tier rather than failing
 *
 * Write actions (`signActions` for the WASM_BLOB / EVM_TX arms) require
 * `signer` and `keyStore` to be supplied.
 *
 * @public
 */
export interface LighterProviderOptions {
  /** Lighter REST base URL. Defaults to mainnet. */
  restUrl?: string
  /** Pre-created Lighter read-only bearer. */
  authToken?: string | (() => string | Promise<string>)
  /**
   * WASM signer instance. Required for `signActions` (write actions) and
   * for on-demand auth-token creating from the user's API key. The default
   * configuration loads the WASM blob shipped with this package.
   */
  signer?: LighterSigner
  /**
   * Store for the user's per-address Lighter API keypair. Required for
   * `signActions` (write actions) and for on-demand auth-token creating.
   */
  keyStore?: LighterKeyStore
  /**
   * Injection overrides (storage, fetcher, clock, host) for the read-only
   * token manager, which is always active — Lighter reads create a long-lived
   * read-only token on first use and reuse it thereafter. The host defaults to
   * `restUrl`. This does not enable or disable the manager; it only overrides
   * its dependencies (primarily for tests / non-browser storage).
   */
  readOnlyTokenOptions?: LighterReadOnlyTokenManagerOptions
  /** Token lifetime for on-demand standard-token creates (Lighter caps at 8h). Default 1h. */
  tokenLifetimeSeconds?: number
  /** Re-create when the cached standard token's remaining life is below this. Default 60s. */
  tokenRenewBufferSeconds?: number
}

interface CachedStandardToken {
  token: string
  /** Unix seconds — re-create when `Date.now()/1000 + renewBuffer >= expiresAt`. */
  expiresAt: number
}

/**
 * Lighter provider plugin extended with a public `resolveAuthToken` so the
 * WS layer can share the same token-resolution closure that the read methods
 * use internally. The base {@link PerpsProviderPlugin} contract stays
 * provider-agnostic — this extension is opt-in for callers that explicitly
 * type against it.
 *
 * @public
 */
export interface LighterPerpsProvider extends PerpsProviderPlugin {
  /**
   * Resolve a Lighter auth token for `address`, following the resolution order
   * documented on {@link LighterProviderOptions} (the per-call override does not
   * apply here). Returns `undefined` when no source can produce a token —
   * callers degrade gracefully.
   */
  resolveAuthToken(address: Address): Promise<string | undefined>
}

/**
 * Lighter provider plugin factory. Returns an object implementing
 * {@link PerpsProviderPlugin}, mirroring the `EthereumProvider()` / `hyperliquidProvider()`
 * shape used by the rest of the LI.FI SDK family.
 *
 * Read functions call Lighter's REST API directly with no LI.FI backend hop.
 * Auth-gated reads resolve their token via the order documented on
 * {@link LighterProviderOptions}.
 *
 * Write actions (`WASM_BLOB` and `EVM_TX` signing) are dispatched via
 * `signActions` — `PerpsClient.execute` delegates those arms here.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({
 *   integrator: 'my-app',
 *   providers: [lighterProvider()],
 * })
 * ```
 * @public
 */
export const lighterProvider = (
  options: LighterProviderOptions = {}
): LighterPerpsProvider => {
  // Late-bind slot: the factory runs before the client exists, so `bind`
  // assigns this once during createPerpsClient and the read methods read it.
  let boundClient: PerpsSDKClient | undefined

  const requireClient = (): PerpsSDKClient => {
    if (boundClient === undefined) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'lighterProvider used before binding. Register it via ' +
          'createPerpsClient({ providers: [lighterProvider()] }).'
      )
    }
    return boundClient
  }

  const restUrl = options.restUrl ?? DEFAULT_LIGHTER_REST_URL
  const authTokenSource: (() => string | Promise<string>) | undefined =
    typeof options.authToken === 'function'
      ? options.authToken
      : options.authToken !== undefined
        ? () => options.authToken as string
        : undefined
  const signer = options.signer
  const keyStore = options.keyStore
  const readOnlyTokenManager = new LighterReadOnlyTokenManager({
    lighterApiUrl: restUrl,
    ...options.readOnlyTokenOptions,
  })
  const tokenLifetimeSeconds = options.tokenLifetimeSeconds ?? 60 * 60
  const tokenRenewBufferSeconds = options.tokenRenewBufferSeconds ?? 60
  const standardTokenByAddress: Map<string, CachedStandardToken> = new Map()
  // Single-flight + failure-cache for lazy read-only token creation. Without
  // these, concurrent reads on first load all race `tokens/create`, and any
  // sustained failure (CORS preflight, body validation, etc.) is retried on
  // every subsequent read — flooding the endpoint. Keyed by lowercase address.
  const readOnlyCreationInFlight: Map<string, Promise<string>> = new Map()
  const readOnlyCreationFailed: Set<string> = new Set()

  const apiClient = (opts?: SDKRequestOptions): LighterApiClient => {
    const client = requireClient()
    return new LighterApiClient(restUrl, {
      signal: opts?.signal,
      policy: resolveRetryPolicy(
        LIGHTER_RETRY_DEFAULTS,
        client.config.retry,
        LIGHTER_PROVIDER_KEY
      ),
      fetchImpl: client.config.fetch,
    })
  }

  /**
   * Build a `Map<market_id, { displaySymbol, logoURI }>` from the backend's
   * `/perps/markets` response. Used by every account-level read to populate
   * `market.baseAsset.displaySymbol` and `.logoURI` on mapped wire shapes.
   * Backend response is Valkey-cached so this is cheap.
   */
  const buildSymbolLookup = async (
    opts?: SDKRequestOptions
  ): Promise<Map<number, LighterMarketMeta>> => {
    const { markets } = await coreGetMarkets(
      requireClient(),
      { provider: LIGHTER_PROVIDER_KEY },
      opts
    )
    return new Map(
      markets
        .filter((m) => m.categoryId === LIGHTER_PROVIDER_KEY)
        .map((m) => [
          Number(m.id),
          {
            displaySymbol: m.baseAsset.displaySymbol,
            logoURI: m.baseAsset.logoURI,
          },
        ])
    )
  }

  /**
   * Resolve the `Asset.id → Asset.displaySymbol` map from the backend's
   * `/perps/assets` token registry. The backend response is Valkey-cached so
   * this is cheap to call per read; no client-side memo (a long-lived instance
   * would otherwise serve a stale registry).
   */
  const buildTokenLookup = async (
    opts?: SDKRequestOptions
  ): Promise<Map<string, string>> => {
    const { assets } = await coreGetAssets(
      requireClient(),
      { provider: LIGHTER_PROVIDER_KEY },
      opts
    )
    return new Map(assets.map((a) => [a.id, a.displaySymbol]))
  }

  const getStandardAuthToken = async (
    address: Address,
    apiKeyPrivateKey: string,
    indices: { apiKeyIndex: number; accountIndex: number }
  ): Promise<string> => {
    if (signer === undefined) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'lighterProvider: getStandardAuthToken called without a configured signer.'
      )
    }
    const cacheKey = address.toLowerCase()
    const nowSec = Math.floor(Date.now() / 1000)
    const cached = standardTokenByAddress.get(cacheKey)
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
    standardTokenByAddress.set(cacheKey, { token, expiresAt })
    return token
  }

  /**
   * Resolve the bearer token for auth-gated reads. Priority:
   *   1. Per-call override (`options.lighterAuthToken`).
   *   2. Constructor-supplied token source.
   *   3. A stored read-only token — preferred for reads: it is read-only, so
   *      forwarding it (incl. to the backend) cannot authorise writes.
   *   4. A read-only token created on first use (via signer + registered API
   *      key) and persisted for reuse.
   *   5. A standard auth token (read+write, 8h max) as a last resort — used
   *      both as the fallback when creation is unavailable/failed and as the
   *      credential that authorises read-only token creation.
   * Returns `undefined` when no source can produce a token — reads degrade
   * gracefully.
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
    if (address === undefined || keyStore === undefined) {
      return undefined
    }
    const apiKey = await keyStore.get(address)
    if (apiKey === null || signer === undefined) {
      return undefined
    }

    const standardToken = (): Promise<string> =>
      getStandardAuthToken(address, apiKey.apiKeyPrivateKey, {
        apiKeyIndex: apiKey.apiKeyIndex,
        accountIndex: apiKey.accountIndex,
      })

    const stored = await readOnlyTokenManager.get(address, apiKey.accountIndex)
    if (stored !== undefined) {
      return stored.token
    }

    const flightKey = address.toLowerCase()
    if (readOnlyCreationFailed.has(flightKey)) {
      return standardToken()
    }
    const inFlight = readOnlyCreationInFlight.get(flightKey)
    if (inFlight !== undefined) {
      return inFlight
    }

    // No read-only token yet — create and persist one. The standard token
    // (API-key-signed) authorises Lighter's `tokens/create`; the returned
    // read-only bearer is what we forward on reads. On failure we mark this
    // address as "skip ro creation for the session" so subsequent reads use
    // the standard token directly instead of hammering `tokens/create`.
    const attempt = (async (): Promise<string> => {
      try {
        const { token } = await readOnlyTokenManager.approve(
          await standardToken(),
          {
            address,
            accountIndex: apiKey.accountIndex,
            expirySeconds:
              Math.floor(Date.now() / 1000) +
              DEFAULT_READ_ONLY_TOKEN_LIFETIME_SECONDS,
            scope: 'all',
          }
        )
        return token.token
      } catch (err) {
        readOnlyCreationFailed.add(flightKey)
        console.warn(
          '[lighter] read-only token creation failed; ' +
            'falling back to standard auth tokens for this session.',
          err
        )
        return standardToken()
      } finally {
        readOnlyCreationInFlight.delete(flightKey)
      }
    })()
    readOnlyCreationInFlight.set(flightKey, attempt)
    return attempt
  }

  const evictReadOnlyToken = async (address: Address): Promise<void> => {
    readOnlyCreationFailed.delete(address.toLowerCase())
    const apiKey = keyStore ? await keyStore.get(address) : null
    if (apiKey !== null) {
      await readOnlyTokenManager.remove(address, apiKey.accountIndex)
    }
  }

  /**
   * Run an auth-gated read; if Lighter rejects the token (revoked server-side —
   * invisible to `checkSetup`, since the read-only token is a client-only
   * concern), evict the stored read-only token and retry once with a freshly
   * resolved one. Only self-heals tokens the SDK itself resolved — a
   * caller-supplied `lighterAuthToken`/`authToken` source is the caller's to fix.
   */
  const retryOnRevoked = async <T>(
    opts: SDKRequestOptions | undefined,
    address: Address,
    token: string,
    run: (token: string) => Promise<T>
  ): Promise<T> => {
    try {
      return await run(token)
    } catch (err) {
      const sdkOwnsToken =
        opts?.lighterAuthToken === undefined && authTokenSource === undefined
      if (!(err instanceof LighterAuthRejectedError) || !sdkOwnsToken) {
        throw err
      }
      await evictReadOnlyToken(address)
      const fresh = await resolveAuthToken(opts, address)
      if (fresh === undefined || fresh === token) {
        throw err
      }
      return await run(fresh)
    }
  }

  const fetchRegisteredApiKey = async (
    client: LighterApiClient,
    accountIndex: number,
    apiKeyIndex: number
  ): Promise<{ api_key_index: number; public_key: string } | undefined> => {
    const response = await client.get<{
      code: number
      api_keys: Array<{ api_key_index: number; public_key: string }>
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

  return {
    type: LIGHTER_PROVIDER_KEY,

    bind(client: PerpsSDKClient): void {
      boundClient = client
    },

    resolveAuthToken(address: Address): Promise<string | undefined> {
      return resolveAuthToken(undefined, address)
    },

    async getAccount(
      params: ProviderGetAccountParams,
      opts?: SDKRequestOptions
    ): Promise<AccountResponse> {
      const client = apiClient(opts)
      const [account, token] = await Promise.all([
        fetchDetailedAccount(client, params.address),
        resolveAuthToken(opts, params.address),
      ])

      const [
        symbolLookup,
        registeredKey,
        limitsResult,
        localKey,
        storedReadOnlyToken,
      ] = await Promise.all([
        buildSymbolLookup(opts),
        fetchRegisteredApiKey(client, account.index, DEFAULT_API_KEY_INDEX),
        // No token is a legitimate unauthenticated read → undefined → zero fee
        // tier. A fetch error is NOT: it must propagate, never be coerced to a
        // fabricated 0%/0% fee tier.
        token === undefined
          ? Promise.resolve(undefined)
          : retryOnRevoked(opts, params.address, token, (t) =>
              fetchAccountLimits(client, account.index, t)
            ),
        keyStore ? keyStore.get(params.address) : Promise.resolve(null),
        readOnlyTokenManager.get(params.address, account.index),
      ])

      // REGISTER_API_KEY is satisfied only when the locally-held keypair
      // matches the key registered on-chain at this slot — existence alone is
      // insufficient (a stale/rotated local key can't sign valid auth tokens).
      const apiKeyRegistered =
        registeredKey !== undefined &&
        localKey !== null &&
        normalizeLighterPublicKey(localKey.apiKeyPublicKey) ===
          normalizeLighterPublicKey(registeredKey.public_key)

      const positions: Position[] = mapOpenPositions(
        account.positions,
        symbolLookup
      )

      const totalMarginUsed = positions.reduce(
        (sum, p) => sum + Number.parseFloat(p.marginUsed),
        0
      )
      const totalUnrealizedPnl = positions.reduce(
        (sum, p) => sum + Number.parseFloat(p.unrealizedPnl),
        0
      )

      // USDC collateral is the category quote asset → collateralBalances.
      // `available_balance` is the free collateral (Lighter's `collateral` is
      // gross, i.e. includes margin locked in positions); the locked portion is
      // carried by the positions' `marginUsed`.
      const collateralBalances: Balance[] = [
        {
          categoryId: LIGHTER_PROVIDER_KEY,
          asset: lighterAsset('USDC', 'USDC'),
          units: account.available_balance,
          valueUsd: account.available_balance,
        },
      ]
      // Spot token holdings — non-collateral. USDC value is 1:1; other tokens
      // have no price source at this boundary, so their USD value is unknown.
      const balances: Balance[] = account.assets.map((a) => ({
        categoryId: LIGHTER_PROVIDER_KEY,
        asset: lighterAsset(String(a.asset_id), a.symbol),
        units: a.balance,
        valueUsd: a.symbol === 'USDC' ? a.balance : '0',
      }))

      const config: LighterAccountConfig = {
        provider: LIGHTER_PROVIDER_KEY,
        accountIndex: account.index,
        apiKeyIndex: DEFAULT_API_KEY_INDEX,
        apiKeyRegistered,
        accountType: account.account_type,
        // Satisfied when a non-expired read-only token is stored locally
        // (`readOnlyTokenManager.get` filters out expired ones).
        readOnlyTokenApproved: storedReadOnlyToken !== undefined,
        readOnlyTokenExpiry: storedReadOnlyToken?.expiry,
        readOnlyTokenScope: storedReadOnlyToken?.scope,
      }

      return {
        provider: LIGHTER_PROVIDER_KEY,
        address: params.address,
        balances,
        collateralBalances,
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
      params: ProviderGetPositionsParams,
      opts?: SDKRequestOptions
    ): Promise<PositionsResponse> {
      const client = apiClient(opts)
      const [account, symbolLookup] = await Promise.all([
        fetchDetailedAccount(client, params.address),
        buildSymbolLookup(opts),
      ])

      let positions: Position[] = mapOpenPositions(
        account.positions,
        symbolLookup
      )

      if (params.marketId !== undefined) {
        positions = positions.filter((p) => p.market.id === params.marketId)
      }

      return {
        provider: LIGHTER_PROVIDER_KEY,
        positions,
        pagination: { limit: params.limit ?? positions.length, hasMore: false },
      }
    },

    async getOrders(
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

      const client = apiClient(opts)
      const [account, symbolLookup] = await Promise.all([
        fetchDetailedAccount(client, params.address),
        buildSymbolLookup(opts),
      ])

      const marketIds =
        params.marketId === undefined
          ? deriveOrderBearingMarketIds(account)
          : [Number(params.marketId)]

      const responses = await retryOnRevoked(opts, params.address, token, (t) =>
        Promise.all(
          marketIds.map((id) =>
            fetchActiveOrdersForMarket(client, t, account.index, id)
          )
        )
      )

      const { openOrders, triggerOrders } = classifyAndMapOrders(
        responses.flatMap((r) => r.orders),
        (marketIndex) =>
          symbolLookup.get(marketIndex)?.displaySymbol ??
          `market_${marketIndex}`
      )

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
      params: ProviderGetOrderParams,
      opts?: SDKRequestOptions
    ): Promise<Order> {
      const token = await resolveAuthToken(opts, params.address)
      if (token === undefined) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          'Lighter order lookup requires an auth token. Pass `authToken` to ' +
            'lighterProvider, register an API key + signer for on-demand creation, or ' +
            'forward `options.lighterAuthToken` on the call.'
        )
      }

      const client = apiClient(opts)
      const [account, symbolLookup] = await Promise.all([
        fetchDetailedAccount(client, params.address),
        buildSymbolLookup(opts),
      ])

      // Native `order_index` route only. The cross-provider `Order.orderId`
      // for Lighter is `String(order_index)` — see `mapOrder`. A tx-hash route
      // would require mapping the caller's executeAction tx hash → wasm nonce
      // → matching order, which the LI.FI backend did via its `UserAction`
      // table; the SDK has no equivalent persistence, so we refuse rather
      // than mis-resolve.
      if (TX_HASH_PATTERN.test(params.id)) {
        throw new PerpsError(
          PerpsErrorCode.OrderNotFound,
          `Lighter order id "${params.id}" looks like a tx hash. The SDK ` +
            `resolves orders by Lighter \`order_index\` only — surface the orderId ` +
            `from the orderUpdates / fills WS stream and pass it here.`
        )
      }
      const predicate: (o: { order_index: number }) => boolean = (o) =>
        String(o.order_index) === params.id

      const marketIds = deriveOrderBearingMarketIds(account)
      const activeResponses = await retryOnRevoked(
        opts,
        params.address,
        token,
        (t) =>
          Promise.all(
            marketIds.map((id) =>
              fetchActiveOrdersForMarket(client, t, account.index, id)
            )
          )
      )

      for (const response of activeResponses) {
        const hit = response.orders.find(predicate as (o: unknown) => boolean)
        if (hit !== undefined) {
          return mapOrderDetail(
            hit,
            symbolLookup.get(hit.market_index)?.displaySymbol ?? ''
          )
        }
      }

      const inactive = await retryOnRevoked(opts, params.address, token, (t) =>
        client.getAuthed<LtOrdersResponse>('/api/v1/accountInactiveOrders', t, {
          account_index: account.index,
          market_id: LIGHTER_ALL_MARKETS_WILDCARD,
          limit: INACTIVE_ORDERS_LOOKUP_LIMIT,
        })
      )
      const hit = inactive.orders.find(predicate as (o: unknown) => boolean)
      if (hit !== undefined) {
        return mapOrderDetail(
          hit,
          symbolLookup.get(hit.market_index)?.displaySymbol ?? ''
        )
      }

      throw new PerpsError(
        PerpsErrorCode.OrderNotFound,
        `Lighter order ${params.id} not found for ${params.address}`
      )
    },

    async getFills(
      params: ProviderGetFillsParams,
      opts?: SDKRequestOptions
    ): Promise<FillsResponse> {
      const client = apiClient(opts)
      const [account, symbolLookup, token] = await Promise.all([
        fetchDetailedAccount(client, params.address),
        buildSymbolLookup(opts),
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
          ? await retryOnRevoked(opts, params.address, token, (tok) =>
              client.getAuthed<LtTradesResponse>(
                '/api/v1/trades',
                tok,
                queryParams
              )
            )
          : await client.get<LtTradesResponse>('/api/v1/trades', queryParams)

      const items = response.trades.map((t) => {
        const meta = symbolLookup.get(t.market_id)
        return mapFill(
          t,
          account.index,
          meta?.displaySymbol ?? `market_${t.market_id}`,
          meta?.logoURI ?? ''
        )
      })

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
      const client = apiClient(opts)
      const account = await fetchDetailedAccount(client, params.address)
      const [history, marketLookup, tokensById] = await Promise.all([
        retryOnRevoked(opts, params.address, token, (t) =>
          fetchAllHistory(
            client,
            t,
            account.index,
            params.address,
            params.type,
            inputCursor
          )
        ),
        buildSymbolLookup(opts),
        buildTokenLookup(opts),
      ])

      const items: ActivityItem[] = [
        ...history.deposits.deposits.map(
          (d): ActivityItem => ({
            id: d.id,
            provider: LIGHTER_PROVIDER_KEY,
            timestamp: toIsoFromMs(d.timestamp),
            type: ActivityType.DEPOSIT,
            amount: d.amount,
            explorerLink: explorerTxUrl(ExplorerChainId.ETHEREUM, d.l1_tx_hash),
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
            explorerLink: explorerTxUrl(ExplorerChainId.ETHEREUM, w.l1_tx_hash),
          })
        ),
        ...history.fundings.position_fundings.map(
          (f): ActivityItem => ({
            id: `funding-${f.funding_id}`,
            provider: LIGHTER_PROVIDER_KEY,
            timestamp: toIsoFromSeconds(f.timestamp),
            type: ActivityType.FUNDING,
            market: marketDisplay(
              String(f.market_id),
              marketLookup.get(f.market_id)?.displaySymbol ?? '',
              marketLookup.get(f.market_id)?.logoURI ?? ''
            ),
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
                market: marketDisplay(
                  String(l.market_id),
                  marketLookup.get(l.market_id)?.displaySymbol ?? '',
                  marketLookup.get(l.market_id)?.logoURI ?? ''
                ),
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
            asset: tokensById.get(String(t.asset_id)) ?? String(t.asset_id),
            amount: t.amount,
            explorerLink: explorerTxUrl(ExplorerChainId.LIGHTER, t.tx_hash),
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

      const nextCursorEnvelope: LighterActivityCursor = {
        deposits: history.deposits.cursor,
        withdraws: history.withdraws.cursor,
        fundings: history.fundings.next_cursor,
        liquidations: history.liquidations.next_cursor,
        transfers: history.transfers.cursor,
        overflow,
      }
      const responseCursor = encodeActivityCursor(nextCursorEnvelope)
      const hasMore = responseCursor !== undefined

      return {
        provider: LIGHTER_PROVIDER_KEY,
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
        LIGHTER_PROVIDER_KEY,
        params,
        LIGHTER_BASE_FEE_TIER,
        opts
      )
    },

    getPortfolioSummary(
      account: AccountResponse,
      positions: Position[]
    ): AccountSummary {
      return summarizeLighterAccount(account, positions)
    },

    formatOrderPrice,

    formatOrderSize,

    estimateLiquidationPrice,

    projectConfig(
      config: AccountConfig,
      setup: ProviderAction[],
      options: ProviderAction[]
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

    /**
     * Hand the backend the local pubkey for REGISTER_API_KEY so its
     * idempotency check can compare against the on-chain slot. No keystore
     * configured, or no key stored for this address → omit the field;
     * backend stages a fresh registration.
     */
    async resolveSetupParams(
      action: ActionType,
      address: Address
    ): Promise<Record<string, unknown>> {
      if (action !== ActionType.REGISTER_API_KEY) {
        return {}
      }
      if (keyStore === undefined) {
        return {}
      }
      const local = await keyStore.get(address)
      if (local === null) {
        return {}
      }
      return { knownPublicKey: local.apiKeyPublicKey }
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
 *
 * @public
 */
export const Lighter = lighterProvider
