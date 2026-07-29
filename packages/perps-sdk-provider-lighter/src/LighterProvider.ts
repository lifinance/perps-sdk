import {
  type DepositFlow,
  explorerTxUrlFromBase,
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
  type ProviderGetMarketSettingsParams,
  type ProviderGetOrderParams,
  type ProviderGetOrdersParams,
  type ProviderGetPositionsParams,
  type ProviderGetQuoteParams,
  resolveQuote,
  resolveRetryPolicy,
  type SDKRequestOptions,
  type SignActionsContext,
  type StorageAdapter,
  toPerpsMarketDisplay,
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
  MarketSettings,
  Order,
  OrdersResponse,
  Position,
  PositionsResponse,
  ProviderAction,
  Quote,
  SignedActionStep,
  SigningMethod,
} from '@lifi/perps-types'
import {
  ActionType,
  ActivityType,
  MarginMode,
  PerpsErrorCode,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import { projectLighterConfigSettings } from './accountConfig.js'
import { getAccountSummary } from './accountSummary.js'
import {
  DEFAULT_API_KEY_INDEX,
  DEFAULT_TRADES_LIMIT,
  LIGHTER_ALL_MARKETS_WILDCARD,
  LIGHTER_BASE_FEE_TIER,
  LIGHTER_FEE_TICK_SCALE,
  LIGHTER_HISTORY_PAGE_SIZE,
  LIGHTER_MAINNET_DEPLOYMENT,
  LIGHTER_RH_DEPLOYMENT,
  LIGHTER_SPOT_CATEGORY_ID,
  type LighterDeployment,
} from './constants.js'
import { lighterDepositFlow } from './depositFlow.js'
import { createAuthToken } from './signers/createAuthToken.js'
import { LighterKeyStore } from './signers/LighterKeyStore.js'
import { LighterReadOnlyTokenManager } from './signers/LighterReadOnlyTokenManager.js'
import { LighterSigner } from './signers/LighterSigner.js'
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
import { LT_MARGIN_MODE_ISOLATED } from './types/index.js'
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
import { isAssetMarginEnabled } from './utils/assetCollateral.js'
import {
  classifyAndMapOrders,
  estimateLiquidationPrice,
  fetchDetailedAccount,
  formatOrderPrice,
  formatOrderSize,
  leverageFromImf,
  lighterAsset,
  mapFill,
  mapOpenPositions,
  mapOrderDetail,
  positionMarginConstraints,
  toIsoFromMs,
  toIsoFromSeconds,
  toRequiredBig,
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
 * authenticated reads. One day under Lighter's 10-year maximum: the cap is
 * enforced against the server clock, so the margin keeps a client clock
 * running ahead from tipping the request over it.
 */
const DEFAULT_READ_ONLY_TOKEN_LIFETIME_SECONDS =
  10 * 365 * 24 * 60 * 60 - 24 * 60 * 60

/**
 * Exponential backoff for re-attempting read-only token creation after a
 * failure. Reads fall back to the standard token only while the current
 * window is open; the next read after it elapses re-attempts creation.
 */
const READ_ONLY_CREATION_BACKOFF_BASE_MS = 30_000
const READ_ONLY_CREATION_BACKOFF_MAX_MS = 10 * 60_000

interface ReadOnlyCreationBackoff {
  /** Epoch ms; creation may be re-attempted once the clock passes this. */
  retryAtMs: number
  attempt: number
}

/** Compare Lighter public keys irrespective of `0x` prefix / casing. */
const normalizeLighterPublicKey = (key: string): string =>
  key.replace(/^0x/i, '').toLowerCase()

/**
 * Consumer-level overrides for a ready-made Lighter provider plugin. Every
 * deployment fact — provider key, endpoints, signing chain id, collateral
 * asset, explorer — belongs to the SDK's {@link LighterDeployment} descriptor
 * and is not settable here; the signer, API-key store and read-only token
 * manager are created per plugin instance.
 *
 * Auth-token resolution order for the auth-gated reads:
 *   1. Per-call `options.lighterAuthToken`
 *   2. Constructor `authToken` (string or async factory)
 *   3. Persisted long-lived read-only token, keyed on the resolved Lighter
 *      `accountIndex`
 *   4. Fresh 1h create via this instance's WASM signer + the user's registered
 *      API key
 *
 * When none of these yields a token the auth-gated reads degrade gracefully:
 *   - `getOrders`, `getActivity` return empty results (mirrors backend behaviour)
 *   - `getOrder` throws `Unauthorized`
 *   - `getAccount` returns zero fee tier rather than failing
 *
 * @public
 */
export interface LighterProviderOptions {
  /**
   * Persistence backend for this instance's Lighter API keypair and read-only
   * token. Defaults to browser `localStorage` (encrypted at rest). Pass a
   * custom adapter for SSR / non-browser hosts or another storage backend.
   */
  storage?: StorageAdapter
  /**
   * Lighter REST base URL. Defaults to the deployment's own endpoint; override
   * to point at a reverse proxy, self-hosted mirror or rate-limit gateway. The
   * instance's signer and read-only token manager follow this URL.
   */
  restUrl?: string
  /** Pre-created Lighter read-only bearer, bypassing SDK token resolution. */
  authToken?: string | (() => string | Promise<string>)
  /** Token lifetime for on-demand standard-token creates (Lighter caps at 8h). Default 1h. */
  tokenLifetimeSeconds?: number
  /** Re-create when the cached standard token's remaining life is below this. Default 60s. */
  tokenRenewBufferSeconds?: number
  /**
   * LI.FI's Lighter referral code — the code `getAccount` compares the account's
   * applied referral against to populate `LighterAccountConfig.referralPresent`.
   * Must match the backend's configured `LIGHTER_REFERRAL_CODE`; when omitted,
   * `referralPresent` is always `false` (the SDK has nothing to compare against).
   */
  referralCode?: string
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
 * Build a Lighter provider plugin for one deployment. The deployment
 * descriptor is SDK-owned, so this stays package-internal: consumers reach it
 * through {@link lighterProvider} / {@link lighterRhProvider}.
 *
 * @internal
 */
export const createLighterProvider = (
  deployment: LighterDeployment,
  options: LighterProviderOptions = {}
): LighterPerpsProvider => {
  // Late-bind slot: the factory runs before the client exists, so `bind`
  // assigns this once during createPerpsClient and the read methods read it.
  let boundClient: PerpsSDKClient | undefined

  const requireClient = (): PerpsSDKClient => {
    if (boundClient === undefined) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `${deployment.providerKey} provider used before binding. Register it ` +
          'via createPerpsClient({ providers: [lighterProvider()] }).'
      )
    }
    return boundClient
  }

  const providerKey = deployment.providerKey
  const restUrl = options.restUrl ?? deployment.restUrl
  const explorerTxBaseUrl = deployment.explorerTxBaseUrl
  const collateral = deployment.collateral
  const authTokenSource: (() => string | Promise<string>) | undefined =
    typeof options.authToken === 'function'
      ? options.authToken
      : options.authToken !== undefined
        ? () => options.authToken as string
        : undefined
  const storage = options.storage ?? localStorageAdapter
  const signer = new LighterSigner({
    apiUrl: restUrl,
    signerChainId: deployment.signerChainId,
    collateralAssetIndex: collateral.assetIndex,
  })
  const keyStore = new LighterKeyStore(storage, providerKey)
  const readOnlyTokenManager = new LighterReadOnlyTokenManager({
    storage,
    providerKey,
    lighterApiUrl: restUrl,
  })
  const tokenLifetimeSeconds = options.tokenLifetimeSeconds ?? 60 * 60
  const tokenRenewBufferSeconds = options.tokenRenewBufferSeconds ?? 60
  const referralCode = options.referralCode
  const standardTokenByAddress: Map<string, CachedStandardToken> = new Map()
  // Single-flight + backoff for lazy read-only token creation. Without these,
  // concurrent reads on first load all race `tokens/create`, and any sustained
  // failure (CORS preflight, body validation, etc.) is retried on every
  // subsequent read — flooding the endpoint. Keyed by lowercase address.
  const readOnlyCreationInFlight: Map<string, Promise<string>> = new Map()
  const readOnlyCreationBackoff: Map<string, ReadOnlyCreationBackoff> =
    new Map()

  const apiClient = (opts?: SDKRequestOptions): LighterApiClient => {
    const client = requireClient()
    return new LighterApiClient(restUrl, {
      signal: opts?.signal,
      policy: resolveRetryPolicy(
        LIGHTER_RETRY_DEFAULTS,
        client.config.retry,
        providerKey
      ),
      fetchImpl: client.config.fetch,
    })
  }

  const getStandardAuthToken = async (
    address: Address,
    apiKeyPrivateKey: string,
    indices: { apiKeyIndex: number; accountIndex: number }
  ): Promise<string> => {
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
   *      as the credential that authorises read-only token creation, and as
   *      the fallback while creation is failing, bounded by the
   *      creation-retry backoff.
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
    if (address === undefined) {
      return undefined
    }
    const apiKey = await keyStore.get(address)
    if (apiKey === null) {
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
    const backoff = readOnlyCreationBackoff.get(flightKey)
    if (backoff !== undefined && Date.now() < backoff.retryAtMs) {
      return standardToken()
    }
    const inFlight = readOnlyCreationInFlight.get(flightKey)
    if (inFlight !== undefined) {
      return inFlight
    }

    // No read-only token yet — create and persist one. The standard token
    // (API-key-signed) authorises Lighter's `tokens/create`; the returned
    // read-only bearer is what we forward on reads. On failure reads fall
    // back to the standard token until the backoff window elapses, then
    // creation is re-attempted — keeping the write-capable token's exposure
    // in read URLs time-bounded.
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
        readOnlyCreationBackoff.delete(flightKey)
        return token.token
      } catch (err) {
        const attemptNumber =
          (readOnlyCreationBackoff.get(flightKey)?.attempt ?? 0) + 1
        const delayMs = Math.min(
          READ_ONLY_CREATION_BACKOFF_BASE_MS * 2 ** (attemptNumber - 1),
          READ_ONLY_CREATION_BACKOFF_MAX_MS
        )
        readOnlyCreationBackoff.set(flightKey, {
          retryAtMs: Date.now() + delayMs,
          attempt: attemptNumber,
        })
        console.warn(
          '[lighter] read-only token creation failed; using the standard ' +
            `auth token for reads and retrying creation in ${Math.round(delayMs / 1000)}s.`,
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

  const evictResolvedTokens = async (address: Address): Promise<void> => {
    const cacheKey = address.toLowerCase()
    readOnlyCreationBackoff.delete(cacheKey)
    // The cached standard token may itself be the revoked credential — it
    // rides reads during the creation-failure fallback and authorises
    // read-only token creation — so a revocation must re-sign it too.
    standardTokenByAddress.delete(cacheKey)
    const apiKey = await keyStore.get(address)
    if (apiKey !== null) {
      await readOnlyTokenManager.remove(address, apiKey.accountIndex)
    }
  }

  /**
   * Run an auth-gated read; if Lighter rejects the token (revoked server-side —
   * invisible to `checkSetup`, since the read-only token is a client-only
   * concern), evict the SDK-resolved credentials (stored read-only token and
   * cached standard token) and retry once with freshly resolved ones. Only
   * self-heals tokens the SDK itself resolved — a caller-supplied
   * `lighterAuthToken`/`authToken` source is the caller's to fix.
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
      await evictResolvedTokens(address)
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

  // `used_code` is the referral currently applied to the account (empty string
  // when none). Keyed by L1 address, mirroring Lighter's `/referral/use` write
  // contract.
  const fetchAppliedReferralCode = async (
    client: LighterApiClient,
    l1Address: Address,
    authToken: string
  ): Promise<string> => {
    const { used_code } = await client.getAuthed<{ used_code: string }>(
      '/api/v1/referral/userReferrals',
      authToken,
      { l1_address: l1Address.toLowerCase() }
    )
    return used_code
  }

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

  const resolveAccountExists = async (
    address: Address,
    opts?: SDKRequestOptions
  ): Promise<boolean> => {
    try {
      await fetchDetailedAccount(apiClient(opts), address)
      return true
    } catch (err) {
      if (
        err instanceof PerpsError &&
        err.code === PerpsErrorCode.AccountNotFound
      ) {
        return false
      }
      throw err
    }
  }

  return {
    type: providerKey,

    internalSetupActions: [ActionType.SET_REFERRAL],

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

      const registry = getMarketRegistry(requireClient(), providerKey)
      const assetRegistry = getAssetRegistry(requireClient(), providerKey)
      const [
        { providers },
        ,
        ,
        registeredKey,
        limitsResult,
        localKey,
        storedReadOnlyToken,
        appliedReferralCode,
      ] = await Promise.all([
        getProviders(requireClient()),
        registry.sync(),
        assetRegistry.sync(),
        fetchRegisteredApiKey(client, account.index, DEFAULT_API_KEY_INDEX),
        // No token is a legitimate unauthenticated read → undefined → zero fee
        // tier. A fetch error is NOT: it must propagate, never be coerced to a
        // fabricated 0%/0% fee tier.
        token === undefined
          ? Promise.resolve(undefined)
          : retryOnRevoked(opts, params.address, token, (t) =>
              fetchAccountLimits(client, account.index, t)
            ),
        keyStore.get(params.address),
        readOnlyTokenManager.get(params.address, account.index),
        // No referral code to compare against, or no token to authenticate the
        // read → undefined → `referralPresent: false`.
        !referralCode || token === undefined
          ? Promise.resolve(undefined)
          : retryOnRevoked(opts, params.address, token, (t) =>
              fetchAppliedReferralCode(client, params.address, t)
            ),
      ])

      // REGISTER_API_KEY is satisfied only when the locally-held keypair
      // matches the key registered on-chain at this slot — existence alone is
      // insufficient (a stale/rotated local key can't sign valid auth tokens).
      const apiKeyRegistered =
        registeredKey !== undefined &&
        localKey !== null &&
        normalizeLighterPublicKey(localKey.apiKeyPublicKey) ===
          normalizeLighterPublicKey(registeredKey.public_key)

      const positions: Position[] = mapOpenPositions(account.positions, (id) =>
        toPerpsMarketDisplay(registry.require(String(id)))
      )

      const totalMarginUsed = positions.reduce(
        (sum, p) => sum + Number.parseFloat(p.marginUsed),
        0
      )
      const totalUnrealizedPnl = positions.reduce(
        (sum, p) => sum + Number.parseFloat(p.unrealizedPnl),
        0
      )

      const categories =
        providers.find((p) => p.key === providerKey)?.categories ?? []
      const perpsCategory = categories.find((c) => c.quoteAsset !== null)
      const spotCategoryId =
        categories.find((c) => c.quoteAsset === null)?.id ??
        LIGHTER_SPOT_CATEGORY_ID

      // Cross buying power is isolated from per-position allocations. Lighter
      // reports cross equity (already marked by cross uPnL) separately from
      // the initial margin locked by cross positions.
      const availableMargin = toRequiredBig(
        account.cross_asset_value,
        'cross_asset_value'
      ).minus(
        toRequiredBig(
          account.cross_initial_margin_requirement,
          'cross_initial_margin_requirement'
        )
      )
      const collateralBalances: Balance[] = [
        {
          categoryId: perpsCategory?.id ?? providerKey,
          asset:
            perpsCategory?.quoteAsset ??
            lighterAsset(
              collateral.displaySymbol,
              collateral.displaySymbol,
              providerKey
            ),
          units: availableMargin.toString(),
          valueUsd: availableMargin.toString(),
        },
      ]
      // Spot token holdings — non-collateral. The instance's settlement asset
      // is valued 1:1; other tokens have no price source at this boundary, so
      // their USD value is unknown.
      const balances: Balance[] = account.assets.map((a) => {
        const assetId = String(a.asset_id)
        return {
          categoryId: spotCategoryId,
          asset:
            assetRegistry.get(assetId) ??
            lighterAsset(assetId, a.symbol, providerKey),
          units: a.balance,
          valueUsd: a.asset_id === collateral.assetIndex ? a.balance : '0',
        }
      })

      const assetCollateral = account.assets.flatMap((a) =>
        a.margin_mode === undefined
          ? []
          : [
              {
                assetId: String(a.asset_id),
                enabled: isAssetMarginEnabled(a.margin_mode),
              },
            ]
      )

      const config: LighterAccountConfig = {
        provider: providerKey,
        accountIndex: account.index,
        apiKeyIndex: DEFAULT_API_KEY_INDEX,
        apiKeyRegistered,
        accountType: account.account_type,
        accountTradingMode: account.account_trading_mode,
        assetCollateral,
        // Satisfied when a non-expired read-only token is stored locally
        // (`readOnlyTokenManager.get` filters out expired ones).
        readOnlyTokenApproved: storedReadOnlyToken !== undefined,
        readOnlyTokenExpiry: storedReadOnlyToken?.expiry,
        readOnlyTokenScope: storedReadOnlyToken?.scope,
        referralPresent:
          appliedReferralCode !== undefined &&
          appliedReferralCode === referralCode,
      }

      return {
        provider: providerKey,
        address: params.address,
        balances,
        collateralBalances,
        positions,
        marginUsed: totalMarginUsed.toString(),
        unrealizedPnl: totalUnrealizedPnl.toString(),
        feeTier:
          limitsResult === undefined
            ? ZERO_FEE_TIER
            : projectFeeTier(limitsResult),
        config,
      }
    },

    async accountExists(
      params: ProviderAccountExistsParams,
      opts?: SDKRequestOptions
    ): Promise<boolean> {
      return resolveAccountExists(params.address, opts)
    },

    async getDepositFlow(
      params: ProviderGetDepositFlowParams,
      opts?: SDKRequestOptions
    ): Promise<DepositFlow> {
      return lighterDepositFlow(
        providerKey,
        await resolveAccountExists(params.address, opts)
      )
    },

    async getPositions(
      params: ProviderGetPositionsParams,
      opts?: SDKRequestOptions
    ): Promise<PositionsResponse> {
      const client = apiClient(opts)
      const registry = getMarketRegistry(requireClient(), providerKey)
      const [account] = await Promise.all([
        fetchDetailedAccount(client, params.address),
        registry.sync(),
      ])

      let positions: Position[] = mapOpenPositions(account.positions, (id) =>
        toPerpsMarketDisplay(registry.require(String(id)))
      )

      if (params.marketId !== undefined) {
        positions = positions.filter((p) => p.market.id === params.marketId)
      }

      return {
        provider: providerKey,
        positions,
        pagination: { limit: params.limit ?? positions.length, hasMore: false },
      }
    },

    /**
     * Lighter reports a market's margin mode and leverage only on the
     * account's position row, so a market the account never touched (or a
     * missing account) resolves `undefined` rather than a venue default.
     */
    async getMarketSettings(
      params: ProviderGetMarketSettingsParams,
      opts?: SDKRequestOptions
    ): Promise<MarketSettings | undefined> {
      // Spot markets carry no margin mode or leverage.
      if (params.market.categoryId === LIGHTER_SPOT_CATEGORY_ID) {
        return undefined
      }
      let account: LtDetailedAccount
      try {
        account = await fetchDetailedAccount(apiClient(opts), params.address)
      } catch (err) {
        if (
          err instanceof PerpsError &&
          err.code === PerpsErrorCode.AccountNotFound
        ) {
          return undefined
        }
        throw err
      }
      const row = account.positions.find(
        (p) => String(p.market_id) === params.market.marketId
      )
      if (!row) {
        return undefined
      }
      const leverage = leverageFromImf(row.initial_margin_fraction)
      if (leverage === undefined) {
        return undefined
      }
      return {
        marginMode:
          row.margin_mode === LT_MARGIN_MODE_ISOLATED
            ? MarginMode.ISOLATED
            : MarginMode.CROSS,
        leverage,
      }
    },

    /**
     * Lighter's `accountActiveOrders` endpoint takes no limit/cursor and
     * returns every active order for the account, so the response is always
     * the complete set: `params.limit` is not honoured and `pagination` is
     * reported as `{ limit: <count returned>, hasMore: false }` with no cursor.
     */
    async getOrders(
      params: ProviderGetOrdersParams,
      opts?: SDKRequestOptions
    ): Promise<OrdersResponse> {
      const token = await resolveAuthToken(opts, params.address)
      if (token === undefined) {
        return {
          provider: providerKey,
          openOrders: [],
          triggerOrders: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }
      }

      const client = apiClient(opts)
      const registry = getMarketRegistry(requireClient(), providerKey)
      const [account] = await Promise.all([
        fetchDetailedAccount(client, params.address),
        registry.sync(),
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
        (marketIndex) => registry.require(String(marketIndex))
      )

      const total = openOrders.length + triggerOrders.length
      return {
        provider: providerKey,
        openOrders,
        triggerOrders,
        pagination: { limit: total, hasMore: false },
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
      const registry = getMarketRegistry(requireClient(), providerKey)
      const [account] = await Promise.all([
        fetchDetailedAccount(client, params.address),
        registry.sync(),
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
          return mapOrderDetail(hit, registry.require(String(hit.market_index)))
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
        return mapOrderDetail(hit, registry.require(String(hit.market_index)))
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
      const token = await resolveAuthToken(opts, params.address)
      if (token === undefined) {
        return {
          provider: providerKey,
          items: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }
      }

      const client = apiClient(opts)
      const registry = getMarketRegistry(requireClient(), providerKey)
      const [account] = await Promise.all([
        fetchDetailedAccount(client, params.address),
        registry.sync(),
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

      const response = await retryOnRevoked(
        opts,
        params.address,
        token,
        (tok) =>
          client.getAuthed<LtTradesResponse>('/api/v1/trades', tok, queryParams)
      )

      const items = response.trades.map((t) =>
        mapFill(t, account.index, registry.require(String(t.market_id)))
      )

      return {
        provider: providerKey,
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
          provider: providerKey,
          items: [],
          pagination: { limit: params.limit ?? 0, hasMore: false },
        }
      }

      const inputCursor = decodeActivityCursor(params.cursor)
      const client = apiClient(opts)
      const account = await fetchDetailedAccount(client, params.address)
      const marketRegistry = getMarketRegistry(requireClient(), providerKey)
      const assetRegistry = getAssetRegistry(requireClient(), providerKey)
      const [history] = await Promise.all([
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
        marketRegistry.sync(),
        assetRegistry.sync(),
      ])

      const items: ActivityItem[] = [
        ...history.deposits.deposits.map(
          (d): ActivityItem => ({
            id: d.id,
            provider: providerKey,
            timestamp: toIsoFromMs(d.timestamp),
            type: ActivityType.DEPOSIT,
            amount: d.amount,
            explorerLink: d.l1_tx_hash
              ? `https://scan.li.fi/tx/${d.l1_tx_hash}`
              : undefined,
          })
        ),
        ...history.withdraws.withdraws.map(
          (w): ActivityItem => ({
            id: w.id,
            provider: providerKey,
            timestamp: toIsoFromMs(w.timestamp),
            type: ActivityType.WITHDRAWAL,
            amount: w.amount,
            fee: '0',
            explorerLink: w.l1_tx_hash
              ? `https://scan.li.fi/tx/${w.l1_tx_hash}`
              : undefined,
          })
        ),
        ...history.fundings.position_fundings.map(
          (f): ActivityItem => ({
            id: `funding-${f.funding_id}`,
            provider: providerKey,
            timestamp: toIsoFromSeconds(f.timestamp),
            type: ActivityType.FUNDING,
            market: marketRegistry.require(String(f.market_id)),
            amount: f.change,
            positionSize: f.position_size,
            fundingRate: f.rate,
          })
        ),
        ...history.liquidations.liquidations.map(
          (l): ActivityItem => ({
            id: `liquidation-${l.id}`,
            provider: providerKey,
            timestamp: toIsoFromMs(l.executed_at),
            type: ActivityType.LIQUIDATION,
            liquidatedNotionalPosition: '0',
            accountValue: '0',
            leverageType: l.type,
            liquidatedPositions: [
              {
                market: marketRegistry.require(String(l.market_id)),
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
            provider: providerKey,
            timestamp: toIsoFromMs(t.timestamp),
            type: ActivityType.TRANSFER,
            direction,
            counterpartyAccountIndex,
            asset:
              assetRegistry.get(String(t.asset_id))?.displaySymbol ??
              String(t.asset_id),
            amount: t.amount,
            explorerLink: explorerTxUrlFromBase(explorerTxBaseUrl, t.tx_hash),
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
        provider: providerKey,
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
        providerKey,
        params,
        LIGHTER_BASE_FEE_TIER,
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

    positionMarginConstraints,

    projectConfig(
      config: AccountConfig,
      setup: ProviderAction[],
      options: ProviderAction[]
    ): AccountConfigSetting[] {
      if (config.provider !== providerKey) {
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
     * idempotency check can compare against the on-chain slot. No key stored
     * for this address → omit the field; backend stages a fresh registration.
     */
    async resolveSetupParams(
      action: ActionType,
      address: Address
    ): Promise<Record<string, unknown>> {
      if (action !== ActionType.REGISTER_API_KEY) {
        return {}
      }
      const local = await keyStore.get(address)
      if (local === null) {
        return {}
      }
      return { knownPublicKey: local.apiKeyPublicKey }
    },

    /**
     * Lighter's WASM signer computes the L2 tx hash before submission, so an
     * execute result carries it and resolves against this instance's explorer.
     */
    resolveExplorerLink(txHash: string): string | undefined {
      return explorerTxUrlFromBase(explorerTxBaseUrl, txHash)
    },

    async signActions(
      method: SigningMethod,
      steps: ActionStep[],
      address: Address,
      ctx?: SignActionsContext
    ): Promise<SignedActionStep[]> {
      return lighterSignActions(
        {
          signer,
          keyStore,
          apiClient: apiClient(),
          resolveAccountIndex: async (addr) => {
            const apiKey = await keyStore.get(addr)
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
 * Lighter mainnet provider plugin. Returns an object implementing
 * {@link PerpsProviderPlugin}, mirroring the `EthereumProvider()` /
 * `hyperliquidProvider()` shape used by the rest of the LI.FI SDK family.
 *
 * Read functions call Lighter's REST API directly with no LI.FI backend hop;
 * auth-gated reads resolve their token via the order documented on
 * {@link LighterProviderOptions}. Write actions (`WASM_BLOB` and `EVM_TX`
 * signing) are dispatched via `signActions` — `PerpsClient.execute` delegates
 * those arms here. The instance owns its WASM signer, API-key store and
 * read-only token manager.
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
): LighterPerpsProvider =>
  createLighterProvider(LIGHTER_MAINNET_DEPLOYMENT, options)

/**
 * Lighter-on-Robinhood-chain provider plugin. Same contract as
 * {@link lighterProvider}, bound to the RH deployment: its own endpoints,
 * zkLighter signing chain id, USDG collateral, and its own signer, API-key
 * store and read-only token manager. Registering both factories on one client
 * keeps their credentials and caches separate.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({
 *   integrator: 'my-app',
 *   providers: [lighterProvider(), lighterRhProvider()],
 * })
 * ```
 * @public
 */
export const lighterRhProvider = (
  options: LighterProviderOptions = {}
): LighterPerpsProvider => createLighterProvider(LIGHTER_RH_DEPLOYMENT, options)

/**
 * Alias matching `@lifi/sdk`'s capitalised factory naming (`EVM()`, `EthereumProvider()`).
 *
 * @public
 */
export const Lighter = lighterProvider
