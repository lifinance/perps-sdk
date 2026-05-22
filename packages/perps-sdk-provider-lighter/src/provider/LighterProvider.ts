import type {
  LighterSigner,
  LighterSignerContext,
  PerpsProvider,
  PerpsSDKClient,
  ProviderGetAccountParams,
  ProviderGetActivityParams,
  ProviderGetAssetParams,
  ProviderGetFillsParams,
  ProviderGetOhlcvParams,
  ProviderGetOrderbookParams,
  ProviderGetOrderParams,
  ProviderGetOrdersParams,
  ProviderGetPositionsParams,
  ProviderGetPricesParams,
  SDKRequestOptions,
} from '@lifi/perps-sdk'
import { PerpsError } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  ActivitiesResponse,
  ActivityItem,
  Address,
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
  TriggerOrder,
} from '@lifi/perps-types'
import { ActivityType, PerpsErrorCode } from '@lifi/perps-types'
import {
  isTriggerType,
  mapFill,
  mapOrder,
  mapOrderDetail,
  mapPosition,
  mapTriggerOrder,
} from '@lifi/perps-types/providers/lighter'
import {
  decodeActivityCursor,
  encodeActivityCursor,
  type LighterActivityCursor,
} from './activityCursor.js'
import { LighterApiClient } from './apiClient.js'
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
} from './apiTypes.js'
import {
  DEFAULT_API_KEY_INDEX,
  DEFAULT_CANDLE_LIMIT,
  DEFAULT_LIGHTER_REST_URL,
  DEFAULT_OHLCV_LOOKBACK_MS,
  DEFAULT_TRADES_LIMIT,
  LIGHTER_ALL_MARKETS_WILDCARD,
  LIGHTER_CODE_ACCOUNT_NOT_FOUND,
  LIGHTER_FEE_TICK_SCALE,
  LIGHTER_HISTORY_PAGE_SIZE,
  LIGHTER_PROVIDER_KEY,
  LtMarginMode,
  MAX_CANDLE_LIMIT,
  MAX_ORDERBOOK_DEPTH,
} from './constants.js'
import {
  LighterMarketRegistry,
  marginFractionToMaxLeverage,
} from './markets.js'
import { mapInterval } from './ohlcvInterval.js'

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
 * Construction options for {@link LighterProvider}.
 *
 * `restUrl` defaults to Lighter mainnet; pass a testnet URL or a self-hosted
 * mirror to override. `authToken` (a pre-minted Lighter read-only bearer)
 * and `signerContext` (a WASM-backed `LighterSigner` plus its
 * `LighterSignerContext`) are alternatives — only one needs to be supplied
 * to unlock auth-gated reads. When BOTH are absent the auth-gated reads
 * (orders/order/activity/account limits) degrade gracefully:
 *   - `getOrders`, `getActivity` return empty results (mirrors backend behaviour)
 *   - `getOrder` throws `Unauthorized`
 *   - `getAccount` returns zero fee tier rather than failing
 *
 * When a `signerContext` is supplied the provider mints fresh auth tokens
 * on-demand via `LighterSigner.createAuthToken`. Tokens have an 8h hard cap;
 * the provider caches the most recent token and re-mints when it's within
 * `tokenRenewBufferSeconds` of expiry.
 */
export interface LighterProviderOptions {
  /** Lighter REST base URL. Defaults to mainnet. */
  restUrl?: string
  /** Pre-minted Lighter read-only bearer. Mutually exclusive with `signerContext`. */
  authToken?: string | (() => string | Promise<string>)
  /** WASM signer + context for on-demand auth token minting. */
  signerContext?: {
    signer: LighterSigner
    context: LighterSignerContext
    /** Token lifetime in seconds (Lighter caps at 8h). Default 1h. */
    lifetimeSeconds?: number
    /** Re-mint when the cached token's remaining life is below this. Default 60s. */
    renewBufferSeconds?: number
  }
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
 * Lighter provider plugin implementing {@link PerpsProvider}.
 *
 * Read functions call Lighter's REST API directly with no LI.FI backend hop.
 * Auth-gated reads use the user-minted read-only token, either pre-minted on
 * `LighterProviderOptions.authToken` or minted on-demand via the bundled
 * WASM signer when `signerContext` is supplied.
 *
 * Write actions (`createAction`/`executeAction`) remain on the core
 * `PerpsClient` — this plugin covers reads only.
 */
export class LighterProvider implements PerpsProvider {
  readonly type = LIGHTER_PROVIDER_KEY

  private readonly restUrl: string
  private readonly authTokenSource: (() => string | Promise<string>) | undefined
  private readonly signerCfg: LighterProviderOptions['signerContext']
  private readonly registry: LighterMarketRegistry
  private mintedToken: MintedToken | undefined

  constructor(options: LighterProviderOptions = {}) {
    if (
      options.authToken !== undefined &&
      options.signerContext !== undefined
    ) {
      throw new PerpsError(
        PerpsErrorCode.ValidationError,
        'LighterProvider: provide either `authToken` or `signerContext`, not both.'
      )
    }
    this.restUrl = options.restUrl ?? DEFAULT_LIGHTER_REST_URL
    this.authTokenSource =
      typeof options.authToken === 'function'
        ? options.authToken
        : options.authToken !== undefined
          ? () => options.authToken as string
          : undefined
    this.signerCfg = options.signerContext
    this.registry = new LighterMarketRegistry(
      new LighterApiClient(this.restUrl),
      {
        metadataTtlMs: options.metadataTtlMs,
        fundingsTtlMs: options.fundingsTtlMs,
      }
    )
  }

  // -------------------------------------------------------------------------
  // Auth-token resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve the bearer token to use on auth-gated calls. Per-call override
   * (`options.lighterAuthToken`) wins, then a pre-minted token from
   * construction, then the WASM signer mints one on demand. Returns
   * `undefined` when no source is configured — callers fall back to the
   * unauthenticated degrade path (empty array / zero fee).
   */
  private async resolveAuthToken(
    options: SDKRequestOptions | undefined
  ): Promise<string | undefined> {
    if (options?.lighterAuthToken !== undefined) {
      return options.lighterAuthToken
    }
    if (this.authTokenSource !== undefined) {
      return this.authTokenSource()
    }
    if (this.signerCfg !== undefined) {
      return this.mintViaSigner()
    }
    return undefined
  }

  private async mintViaSigner(): Promise<string> {
    const cfg = this.signerCfg
    if (cfg === undefined) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'LighterProvider.mintViaSigner called without a configured signer context.'
      )
    }
    const lifetime = cfg.lifetimeSeconds ?? 60 * 60
    const buffer = cfg.renewBufferSeconds ?? 60
    const nowSec = Math.floor(Date.now() / 1000)
    if (
      this.mintedToken !== undefined &&
      this.mintedToken.expiresAt - nowSec > buffer
    ) {
      return this.mintedToken.token
    }
    const deadline = nowSec + lifetime
    const token = await cfg.signer.createAuthToken(deadline, cfg.context)
    this.mintedToken = { token, expiresAt: deadline }
    return token
  }

  // -------------------------------------------------------------------------
  // PerpsProvider — read methods
  // -------------------------------------------------------------------------

  async getAccount(
    _client: PerpsSDKClient,
    params: ProviderGetAccountParams,
    options?: SDKRequestOptions
  ): Promise<AccountResponse> {
    const client = this.apiClient(options)
    const account = await this.fetchDetailedAccount(client, params.address)
    const token = await this.resolveAuthToken(options)

    const [symbolLookup, registeredKey, limitsResult] = await Promise.all([
      this.registry.marketIdToSymbol(),
      this.fetchRegisteredApiKey(client, account.index, DEFAULT_API_KEY_INDEX),
      token === undefined
        ? Promise.resolve(undefined)
        : this.fetchAccountLimits(client, account.index, token).catch(
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
  }

  async getPositions(
    _client: PerpsSDKClient,
    params: ProviderGetPositionsParams,
    options?: SDKRequestOptions
  ): Promise<PositionsResponse> {
    const client = this.apiClient(options)
    const account = await this.fetchDetailedAccount(client, params.address)
    const symbolLookup = await this.registry.marketIdToSymbol()

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
  }

  async getOrders(
    _client: PerpsSDKClient,
    params: ProviderGetOrdersParams,
    options?: SDKRequestOptions
  ): Promise<OrdersResponse> {
    const token = await this.resolveAuthToken(options)
    if (token === undefined) {
      return {
        provider: LIGHTER_PROVIDER_KEY,
        openOrders: [],
        triggerOrders: [],
        pagination: { limit: params.limit ?? 0, hasMore: false },
      }
    }

    const client = this.apiClient(options)
    const [account, symbolLookup] = await Promise.all([
      this.fetchDetailedAccount(client, params.address),
      this.registry.marketIdToSymbol(),
    ])

    const marketIds =
      params.symbol === undefined
        ? this.deriveOrderBearingMarketIds(account)
        : [await this.registry.resolveMarketId(params.symbol)]

    const responses = await Promise.all(
      marketIds.map((id) =>
        this.fetchActiveOrdersForMarket(client, token, account.index, id)
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
  }

  async getOrder(
    _client: PerpsSDKClient,
    params: ProviderGetOrderParams,
    options?: SDKRequestOptions
  ): Promise<Order> {
    const token = await this.resolveAuthToken(options)
    if (token === undefined) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'Lighter order lookup requires an auth token. Pass `authToken` to ' +
          'LighterProvider, mint one with LighterSigner.createAuthToken, or ' +
          'forward `options.lighterAuthToken` on the call.'
      )
    }

    const client = this.apiClient(options)
    const [account, symbolLookup] = await Promise.all([
      this.fetchDetailedAccount(client, params.address),
      this.registry.marketIdToSymbol(),
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

    const marketIds = this.deriveOrderBearingMarketIds(account)
    const activeResponses = await Promise.all(
      marketIds.map((id) =>
        this.fetchActiveOrdersForMarket(client, token, account.index, id)
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
  }

  async getFills(
    _client: PerpsSDKClient,
    params: ProviderGetFillsParams,
    options?: SDKRequestOptions
  ): Promise<FillsResponse> {
    const client = this.apiClient(options)
    const [account, symbolLookup, token] = await Promise.all([
      this.fetchDetailedAccount(client, params.address),
      this.registry.marketIdToSymbol(),
      this.resolveAuthToken(options),
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
  }

  async getActivity(
    _client: PerpsSDKClient,
    params: ProviderGetActivityParams,
    options?: SDKRequestOptions
  ): Promise<ActivitiesResponse> {
    const token = await this.resolveAuthToken(options)
    if (token === undefined) {
      return {
        provider: LIGHTER_PROVIDER_KEY,
        items: [],
        pagination: { limit: params.limit ?? 0, hasMore: false },
      }
    }

    const inputCursor = decodeActivityCursor(params.cursor)
    const client = this.apiClient(options)
    const account = await this.fetchDetailedAccount(client, params.address)
    const [history, marketLookup, assetLookup] = await Promise.all([
      this.fetchAllHistory(
        client,
        token,
        account.index,
        params.address,
        params.type,
        inputCursor
      ),
      this.registry.marketIdToSymbol(),
      this.registry.assetIdToSymbol(),
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
  }

  async getAsset(
    _client: PerpsSDKClient,
    params: ProviderGetAssetParams,
    options?: SDKRequestOptions
  ): Promise<Asset> {
    const all = await this.collectAssets(options)
    const found = all.find((a) => a.assetId === params.symbol)
    if (!found) {
      throw new PerpsError(
        PerpsErrorCode.MarketNotFound,
        `Lighter asset not found: ${params.symbol}`
      )
    }
    return found
  }

  async getAssets(
    _client: PerpsSDKClient,
    options?: SDKRequestOptions
  ): Promise<AssetsResponse> {
    return { assets: await this.collectAssets(options) }
  }

  async getPrices(
    _client: PerpsSDKClient,
    params: ProviderGetPricesParams,
    _options?: SDKRequestOptions
  ): Promise<PricesResponse> {
    const [perps, spots] = await Promise.all([
      this.registry.activePerps(),
      this.registry.activeSpots(),
    ])
    const all = [...perps, ...spots].map((m) => ({
      assetId: m.symbol,
      price: m.last_trade_price.toString(),
    }))
    const filtered =
      params.symbols === undefined
        ? all
        : all.filter((p) => params.symbols?.includes(p.assetId))
    return { prices: filtered }
  }

  async getOhlcv(
    _client: PerpsSDKClient,
    params: ProviderGetOhlcvParams,
    options?: SDKRequestOptions
  ): Promise<OhlcvResponse> {
    const client = this.apiClient(options)
    const marketId = await this.registry.resolveMarketId(params.symbol)
    const now = Date.now()
    const startTime = params.startTime ?? now - DEFAULT_OHLCV_LOOKBACK_MS
    const endTime = params.endTime ?? now
    const limit = Math.min(
      params.limit ?? DEFAULT_CANDLE_LIMIT,
      MAX_CANDLE_LIMIT
    )

    const response = await client.get<{
      code: number
      r: string
      c: Array<{
        t: number
        o: number
        h: number
        l: number
        c: number
        v: number
      }>
    }>('/api/v1/candles', {
      market_id: marketId,
      resolution: mapInterval(params.interval),
      start_timestamp: Math.floor(startTime / 1000),
      end_timestamp: Math.floor(endTime / 1000),
      count_back: limit,
    })

    return {
      provider: LIGHTER_PROVIDER_KEY,
      assetId: params.symbol,
      interval: params.interval,
      candles: response.c.slice(0, limit).map((c) => ({
        t: c.t,
        o: c.o.toString(),
        h: c.h.toString(),
        l: c.l.toString(),
        c: c.c.toString(),
        v: c.v.toString(),
      })),
    }
  }

  async getOrderbook(
    _client: PerpsSDKClient,
    params: ProviderGetOrderbookParams,
    options?: SDKRequestOptions
  ): Promise<OrderbookResponse> {
    const client = this.apiClient(options)
    const marketId = await this.registry.resolveMarketId(params.symbol)
    const maxDepth = Math.min(
      params.depth ?? MAX_ORDERBOOK_DEPTH,
      MAX_ORDERBOOK_DEPTH
    )

    const response = await client.get<{
      code: number
      asks: Array<{ price: string; remaining_base_amount: string }>
      bids: Array<{ price: string; remaining_base_amount: string }>
    }>('/api/v1/orderBookOrders', {
      market_id: marketId,
      limit: maxDepth,
    })

    return {
      provider: LIGHTER_PROVIDER_KEY,
      assetId: params.symbol,
      bids: response.bids.slice(0, maxDepth).map((o) => ({
        price: o.price,
        size: o.remaining_base_amount,
      })),
      asks: response.asks.slice(0, maxDepth).map((o) => ({
        price: o.price,
        size: o.remaining_base_amount,
      })),
      timestamp: Date.now(),
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private apiClient(options: SDKRequestOptions | undefined): LighterApiClient {
    return new LighterApiClient(this.restUrl, options?.signal)
  }

  private async collectAssets(
    _options: SDKRequestOptions | undefined
  ): Promise<Asset[]> {
    const [perps, spots, fundingRates, tokenLogos] = await Promise.all([
      this.registry.activePerps(),
      this.registry.activeSpots(),
      this.registry.fundingRatesByMarket(),
      this.registry.tokenLogos(),
    ])

    const assets: Asset[] = []
    for (const m of perps) {
      const fundingRate = fundingRates.get(m.market_id) ?? 0
      assets.push({
        assetId: m.symbol,
        market: LIGHTER_PROVIDER_KEY,
        displaySymbol: m.symbol,
        displayQuote: 'USDC',
        logoURI: tokenLogos.get(m.symbol) ?? '',
        szDecimals: m.supported_size_decimals,
        maxLeverage: marginFractionToMaxLeverage(m.min_initial_margin_fraction),
        onlyIsolated:
          m.market_config.market_margin_mode === LtMarginMode.ISOLATED,
        funding: { rate: fundingRate.toString(), nextFundingTime: 0 },
        openInterest: m.open_interest.toString(),
        volume24h: m.daily_quote_token_volume.toString(),
        prevDayPrice:
          m.last_trade_price === 0
            ? undefined
            : (
                m.last_trade_price /
                (1 + m.daily_price_change / 100)
              ).toString(),
        markPrice: m.last_trade_price.toString(),
      })
    }
    for (const m of spots) {
      const baseSymbol = m.symbol.split('/')[0] ?? m.symbol
      assets.push({
        assetId: m.symbol,
        market: 'spot',
        displaySymbol: m.symbol,
        displayQuote: null,
        logoURI: tokenLogos.get(baseSymbol) ?? tokenLogos.get(m.symbol) ?? '',
        szDecimals: m.supported_size_decimals,
        maxLeverage: 1,
        onlyIsolated: false,
        funding: { rate: '0', nextFundingTime: 0 },
        volume24h: m.daily_quote_token_volume.toString(),
        markPrice: m.last_trade_price.toString(),
      })
    }
    return assets
  }

  private async fetchDetailedAccount(
    client: LighterApiClient,
    address: Address
  ): Promise<LtDetailedAccount> {
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

  private async fetchRegisteredApiKey(
    client: LighterApiClient,
    accountIndex: number,
    apiKeyIndex: number
  ): Promise<{ api_key_index: number } | undefined> {
    const response = await client.get<{
      code: number
      api_keys: Array<{ api_key_index: number }>
    }>('/api/v1/apikeys', { account_index: accountIndex })
    return response.api_keys?.find((k) => k.api_key_index === apiKeyIndex)
  }

  private async fetchAccountLimits(
    client: LighterApiClient,
    accountIndex: number,
    authToken: string
  ): Promise<LtAccountLimits> {
    return client.getAuthed<LtAccountLimits>(
      '/api/v1/accountLimits',
      authToken,
      { account_index: accountIndex }
    )
  }

  private async fetchActiveOrdersForMarket(
    client: LighterApiClient,
    authToken: string,
    accountIndex: number,
    marketId: number
  ): Promise<LtOrdersResponse> {
    return client.getAuthed<LtOrdersResponse>(
      '/api/v1/accountActiveOrders',
      authToken,
      { account_index: accountIndex, market_id: marketId }
    )
  }

  private deriveOrderBearingMarketIds(account: LtDetailedAccount): number[] {
    return account.positions
      .filter((p) => orderCountFor(p) > 0)
      .map((p) => p.market_id)
  }

  private async fetchAllHistory(
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
  }> {
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
}

/**
 * Factory wrapper mirroring `@lifi/sdk`'s `EVM()` / `HyperliquidProvider()`
 * pattern — returns a fresh `LighterProvider` instance the caller hands to
 * `createPerpsClient({ providers: [...] })`.
 */
export const Lighter = (options?: LighterProviderOptions): LighterProvider =>
  new LighterProvider(options)

/** Alias matching the AC's `LighterProvider()` factory naming. */
export const lighterProvider = Lighter
