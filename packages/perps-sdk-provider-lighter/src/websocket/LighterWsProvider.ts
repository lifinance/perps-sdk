import {
  cachePromise,
  getMarketRegistry,
  type MarketRegistry,
  type PerpsSDKClient,
  type ProviderGetQuoteParams,
  type QuoteListener,
  ReconnectingWebSocket,
  resolveRetryPolicy,
  resolveSubscribeQuote,
  WsProviderBase,
  type WsProviderFactory,
  wsLog,
} from '@lifi/perps-sdk'
import type {
  Fill,
  MarketContext,
  Position,
  Subscription,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import { LIGHTER_BASE_FEE_TIER, LIGHTER_PROVIDER_KEY } from '../constants.js'
import type {
  LtAccountPosition,
  LtOrder,
  LtTrade,
  LtWsAccountAllOrdersMessage,
  LtWsAccountAllPositionsMessage,
  LtWsAccountAllTradesMessage,
  LtWsMarketStats,
  LtWsMarketStatsAllMessage,
  LtWsMessage,
  LtWsOrderBook,
  LtWsOrderBookMessage,
  LtWsSpotMarketStats,
  LtWsSpotMarketStatsAllMessage,
} from '../types/index.js'
import { LIGHTER_RETRY_DEFAULTS, LighterApiClient } from '../utils/apiClient.js'
import {
  classifyAndMapOrders,
  fetchDetailedAccount,
  mapFill,
  mapMarketContext,
  mapPosition,
} from '../utils/index.js'

// Public channels: `marketsContext` (market_stats/all + spot_market_stats/all),
// `orderbook` (order_book/N).
// Authenticated channels (require an `authProvider` option):
//   - orderUpdates → account_all_orders/{account_index}
//   - fills        → account_all_trades/{account_index}
//   - positions    → account_all_positions/{account_index}
//
// Auth pattern (per Lighter WS spec): the subscribe payload carries the
// token directly — `{ type: "subscribe", channel: "...", auth: "<token>" }`.
// Tokens are created via the Lighter WASM signer (CreateAuthToken) by the
// caller; we re-request a fresh token on every subscribe send so reconnects
// after the original token expires automatically pick up a new one.
//
// account_index is resolved per-address via `/api/v1/account?by=l1_address`
// and cached for the lifetime of the provider — Lighter's account index is
// stable for a given L1 wallet.
//
// The market identity for each `market_id` is resolved from the shared
// MarketRegistry. The canonical `Market.id` for Lighter is `String(market_id)`
// ("0", "1", …); the full market identity (base/quote `Asset`) is carried
// verbatim onto mapped orders/fills/positions.
//
// Orderbook is stateful: the first message is a full snapshot, subsequent
// messages are deltas where size=0 deletes a level.

const DEFAULT_WS_URL = 'wss://mainnet.zklighter.elliot.ai/stream'
const DEFAULT_REST_URL = 'https://mainnet.zklighter.elliot.ai'

const LIGHTER_AUTH_CHANNEL = {
  orderUpdates: 'account_all_orders',
  fills: 'account_all_trades',
  positions: 'account_all_positions',
} as const

/** Channels whose handlers resolve market identity from the registry. */
function channelNeedsMarkets(channel: Subscription['channel']): boolean {
  return (
    channel === 'orderUpdates' || channel === 'fills' || channel === 'positions'
  )
}

/**
 * Creates a fresh Lighter auth token for the given L1 address, or returns
 * `undefined` if no API key is registered. Called both on initial subscribe
 * and on every reconnect, so it must always return a token valid for at
 * least the next few minutes.
 *
 * @public
 */
export type LighterAuthProvider = (
  address: Address
) => Promise<string | undefined>

interface SubState {
  /** Raw Lighter WS channel name (e.g. `order_book/5`, `account_all_orders/42`). */
  channel: string
  /** L1 address that triggered this sub (auth channels only). */
  address?: Address
  /** Whether this channel needs an `auth` field on each subscribe send. */
  needsAuth: boolean
}

interface OrderbookState {
  bids: Map<string, string>
  asks: Map<string, string>
  assetId: string
}

/**
 * Options for {@link lighterWsProvider} / {@link LighterWsProvider}.
 *
 * @public
 */
export interface LighterWsProviderOptions {
  /** REST base URL for `/api/v1/account` lookups. Defaults to mainnet. */
  restUrl?: string
  /**
   * Async function returning a Lighter auth token for an address. Required
   * for authenticated channels (orderUpdates, positions). Without it those
   * subscriptions will throw at subscribe time.
   */
  authProvider?: LighterAuthProvider
}

/**
 * Lighter realtime WS provider (extends {@link WsProviderBase}): subscribes to
 * Lighter's WS channels (orderbook, marketsContext, orders, positions), attaching auth
 * tokens to gated channels. Construct via {@link lighterWsProvider}.
 *
 * @public
 */
export class LighterWsProvider extends WsProviderBase<SubState> {
  private readonly api: LighterApiClient
  private readonly authProvider: LighterAuthProvider | undefined
  private readonly client: PerpsSDKClient | undefined

  private readonly orderbooks = new Map<number, OrderbookState>()
  private marketsContext: Record<string, MarketContext> = {}

  /**
   * `address → market_id → Position`. `subscribed/...` frames reseed it and
   * `update/...` frames upsert into it (zero size deletes), so every emission
   * is a full open-position snapshot per the `PositionsEvent` contract.
   */
  private readonly positionsByAddress = new Map<string, Map<number, Position>>()

  private readonly registry: MarketRegistry | undefined

  private readonly accountIndexCache = new Map<string, number>()
  private readonly accountIndexPromises = new Map<string, Promise<number>>()

  constructor(
    wsUrl: string = DEFAULT_WS_URL,
    providerKey = 'lighter',
    options: LighterWsProviderOptions = {},
    client?: PerpsSDKClient
  ) {
    super(
      new ReconnectingWebSocket(wsUrl, { pingPayload: '{"type":"ping"}' }),
      providerKey
    )
    this.api = new LighterApiClient(options.restUrl ?? DEFAULT_REST_URL, {
      policy: resolveRetryPolicy(
        LIGHTER_RETRY_DEFAULTS,
        client?.config.retry,
        LIGHTER_PROVIDER_KEY
      ),
      fetchImpl: client?.config.fetch,
    })
    this.authProvider = options.authProvider
    this.client = client
    this.registry = client && getMarketRegistry(client, providerKey)
  }

  async subscribeQuote(
    params: ProviderGetQuoteParams,
    onQuote: QuoteListener
  ): Promise<() => void> {
    const client = this.client
    if (client === undefined) {
      throw new Error(
        'LighterWsProvider: PerpsSDKClient not provided; cannot stream quotes. ' +
          'Construct via `lighterWsProvider({...})` and register with PerpsWsClient.'
      )
    }
    return resolveSubscribeQuote(
      client,
      this.providerKey,
      this,
      params,
      LIGHTER_BASE_FEE_TIER,
      onQuote
    )
  }

  protected async openChannel(sub: Subscription): Promise<() => void> {
    // Lighter has no live OHLC channel — there's nothing to subscribe to.
    // Return a no-op unsubscribe so the caller's UX (chart still rendering
    // from REST history + price-tick mid line) is unaffected, instead of
    // throwing and surfacing a console error on every chart mount.
    if (sub.channel === 'candle') {
      return () => {}
    }

    // Only the auth channels (orders/fills/positions) resolve markets.
    // `marketsContext`/`orderbook` are keyed purely by `String(market_id)`, so
    // gating them on the registry sync would let a failed `/markets` fetch kill
    // live price ticks.
    if (channelNeedsMarkets(sub.channel)) {
      await this.registry?.sync()
    }

    const wireChannels = await this.resolveChannel(sub)

    // Registry keyed by the wire channel (unique per sub), so replay-failure
    // logs name the channel the venue knows. A logical sub may fan out to
    // several wire channels (e.g. `marketsContext`), each registered independently.
    for (const { channel, needsAuth, address } of wireChannels) {
      await this.registerSub(channel, { channel, needsAuth, address })
    }
    await this.rws.ready()

    return () => {
      for (const { channel } of wireChannels) {
        this.unregisterSub(channel)
        this.rws.send(JSON.stringify({ type: 'unsubscribe', channel }))
      }
      if (sub.channel === 'orderbook') {
        const id = Number(sub.marketId)
        if (Number.isFinite(id)) {
          this.orderbooks.delete(id)
        }
      }
      if (sub.channel === 'positions') {
        this.positionsByAddress.delete(sub.address.toLowerCase())
      }
    }
  }

  protected override onClose(): void {
    this.orderbooks.clear()
    this.marketsContext = {}
    this.positionsByAddress.clear()
  }

  protected async sendSubscribe({
    channel,
    needsAuth,
    address,
  }: SubState): Promise<void> {
    const payload: { type: 'subscribe'; channel: string; auth?: string } = {
      type: 'subscribe',
      channel,
    }
    if (needsAuth) {
      if (!this.authProvider || !address) {
        throw new Error(
          `Lighter WS channel '${channel}' requires authentication but no authProvider was supplied.`
        )
      }
      const token = await this.authProvider(address)
      if (!token) {
        throw new Error(
          `Lighter WS channel '${channel}' requires authentication but no token was available for ${address}.`
        )
      }
      payload.auth = token
    }
    this.rws.send(JSON.stringify(payload))
  }

  protected toKey(sub: Subscription): string {
    switch (sub.channel) {
      case 'marketsContext':
        return 'marketsContext'
      case 'orderbook':
        return `orderbook:${sub.marketId}`
      case 'orderUpdates':
        return `orderUpdates:${sub.address.toLowerCase()}`
      case 'fills':
        return `fills:${sub.address.toLowerCase()}`
      case 'positions':
        return `positions:${sub.address.toLowerCase()}`
      // No live wire sub (openChannel returns a no-op), but a stable key is
      // still needed so the base's fan-out registry can track/release it.
      case 'candle':
        return `candle:${sub.marketId}:${sub.interval}`
      case 'spotBalances':
        throw new Error(`Lighter WS does not support channel: ${sub.channel}.`)
    }
  }

  private async resolveChannel(sub: Subscription): Promise<
    Array<{
      channel: string
      needsAuth: boolean
      address?: Address
    }>
  > {
    if (sub.channel === 'marketsContext') {
      // Lighter splits stats across two wire channels: perp markets on
      // `market_stats/all`, spot markets on `spot_market_stats/all`. Both feed
      // the single aggregated `marketsContext` emit.
      return [
        { channel: 'market_stats/all', needsAuth: false },
        { channel: 'spot_market_stats/all', needsAuth: false },
      ]
    }
    if (sub.channel === 'orderbook') {
      const id = Number(sub.marketId)
      if (!Number.isFinite(id)) {
        throw new Error(
          `Lighter WS: unknown market for marketId '${sub.marketId}'. ` +
            'MarketId must be a numeric market_id string.'
        )
      }
      return [{ channel: `order_book/${id}`, needsAuth: false }]
    }
    if (
      sub.channel === 'orderUpdates' ||
      sub.channel === 'fills' ||
      sub.channel === 'positions'
    ) {
      const accountIndex = await this.resolveAccountIndex(sub.address)
      const lighterChannel = LIGHTER_AUTH_CHANNEL[sub.channel]
      // `account_all_trades` is publicly readable per the Lighter WS spec —
      // an auth token only filters events to the user's own account, which
      // we don't currently use to scope further. Skip the token here so a
      // user without a registered API key still gets their fill stream.
      const needsAuth = sub.channel !== 'fills'
      return [
        {
          channel: `${lighterChannel}/${accountIndex}`,
          needsAuth,
          address: sub.address,
        },
      ]
    }
    throw new Error(
      `Lighter WS does not support channel: ${(sub as { channel: string }).channel}.`
    )
  }

  private async resolveAccountIndex(address: Address): Promise<number> {
    const addressKey = address.toLowerCase()
    const cached = this.accountIndexCache.get(addressKey)
    if (cached !== undefined) {
      return cached
    }
    const idx = await cachePromise(
      () => this.accountIndexPromises.get(addressKey),
      (p) => {
        if (p === undefined) {
          this.accountIndexPromises.delete(addressKey)
        } else {
          this.accountIndexPromises.set(addressKey, p)
        }
      },
      () => this.fetchAccountIndex(address)
    )
    this.accountIndexCache.set(addressKey, idx)
    return idx
  }

  private async fetchAccountIndex(address: Address): Promise<number> {
    const account = await fetchDetailedAccount(this.api, address)
    return account.index
  }

  protected handleMessage(raw: string): void {
    let msg: LtWsMessage
    try {
      msg = JSON.parse(raw) as LtWsMessage
    } catch {
      wsLog.parseFailure(LIGHTER_PROVIDER_KEY, raw)
      return
    }

    if (!isValidLighterFrame(msg)) {
      wsLog.parseFailure(LIGHTER_PROVIDER_KEY, raw)
      return
    }

    try {
      this.dispatch(msg)
    } catch (error) {
      wsLog.handlerFailure(LIGHTER_PROVIDER_KEY, error)
    }
  }

  private dispatch(msg: LtWsMessage): void {
    if (msg.type === 'ping') {
      this.rws.send(JSON.stringify({ type: 'pong' }))
      return
    }

    if (
      msg.type === 'subscribed/market_stats' ||
      msg.type === 'update/market_stats'
    ) {
      this.handleMarketStats((msg as LtWsMarketStatsAllMessage).market_stats)
      return
    }

    if (
      msg.type === 'subscribed/spot_market_stats' ||
      msg.type === 'update/spot_market_stats'
    ) {
      this.handleMarketStats(
        (msg as LtWsSpotMarketStatsAllMessage).spot_market_stats
      )
      return
    }

    if (
      msg.type === 'subscribed/order_book' ||
      msg.type === 'update/order_book'
    ) {
      this.handleOrderBook(
        msg as LtWsOrderBookMessage,
        msg.type === 'subscribed/order_book'
      )
      return
    }

    if (
      msg.type === 'subscribed/account_all_orders' ||
      msg.type === 'update/account_all_orders'
    ) {
      this.handleAccountOrders(msg as LtWsAccountAllOrdersMessage)
      return
    }

    if (
      msg.type === 'subscribed/account_all_trades' ||
      msg.type === 'update/account_all_trades'
    ) {
      this.handleAccountTrades(msg as LtWsAccountAllTradesMessage)
      return
    }

    if (
      msg.type === 'subscribed/account_all_positions' ||
      msg.type === 'update/account_all_positions'
    ) {
      this.handleAccountPositions(
        msg as LtWsAccountAllPositionsMessage,
        msg.type === 'subscribed/account_all_positions'
      )
      return
    }
  }

  private handleAccountOrders(msg: LtWsAccountAllOrdersMessage): void {
    const address = this.addressFromChannel(msg.channel, 'account_all_orders')
    if (!address) {
      return
    }
    const raw = collectAuthChannelItems<LtOrder>(msg, 'orders')
    // A registry miss warns once and schedules a cooldown-gated refetch (the
    // id may have listed after the snapshot); the order is skipped.
    const data = classifyAndMapOrders(raw, (marketIndex) =>
      this.registry?.get(String(marketIndex))
    )
    this.emit(`orderUpdates:${address}`, {
      channel: 'orderUpdates',
      data,
    })
  }

  private handleAccountTrades(msg: LtWsAccountAllTradesMessage): void {
    const address = this.addressFromChannel(msg.channel, 'account_all_trades')
    if (!address) {
      return
    }
    const accountIndex = this.accountIndexCache.get(address)
    if (accountIndex === undefined) {
      return
    }
    const raw = collectAuthChannelItems<LtTrade>(msg, 'trades')
    const fills: Fill[] = raw.flatMap((t) => {
      const market = this.registry?.get(String(t.market_id))
      return market ? [mapFill(t, accountIndex, market)] : []
    })
    this.emit(`fills:${address}`, { channel: 'fills', data: fills })
  }

  private handleAccountPositions(
    msg: LtWsAccountAllPositionsMessage,
    isSnapshot: boolean
  ): void {
    const address = this.addressFromChannel(
      msg.channel,
      'account_all_positions'
    )
    if (!address) {
      return
    }
    const raw = collectAuthChannelItems<LtAccountPosition>(msg, 'positions')
    let state = this.positionsByAddress.get(address)
    if (!state || isSnapshot) {
      state = new Map()
      this.positionsByAddress.set(address, state)
    }
    for (const p of raw) {
      if (Number.parseFloat(p.position) === 0) {
        state.delete(p.market_id)
      } else {
        const market = this.registry?.get(String(p.market_id))
        if (market) {
          state.set(p.market_id, mapPosition(p, market))
        }
      }
    }
    this.emit(`positions:${address}`, {
      channel: 'positions',
      data: [...state.values()],
    })
  }

  /**
   * Reverse-lookup the L1 address from an auth-channel message. The subscribe
   * payload uses `/` (e.g. `account_all_orders/42`) but the server sends
   * responses with `:` (e.g. `account_all_orders:42`) — both forms are
   * accepted here so reconnect resubscriptions and live updates both route
   * correctly.
   */
  private addressFromChannel(
    channel: string | undefined,
    prefix: string
  ): string | null {
    if (!channel?.startsWith(prefix)) {
      return null
    }
    const sep = channel[prefix.length]
    if (sep !== '/' && sep !== ':') {
      return null
    }
    const idx = Number(channel.slice(prefix.length + 1))
    if (!Number.isFinite(idx)) {
      return null
    }
    for (const [addr, cachedIdx] of this.accountIndexCache) {
      if (cachedIdx === idx) {
        return addr
      }
    }
    return null
  }

  private handleMarketStats(
    stats?: Record<string, LtWsMarketStats | LtWsSpotMarketStats>
  ): void {
    if (!stats) {
      return
    }
    const entries = Object.values(stats)
    if (entries.length === 0) {
      return
    }
    for (const entry of entries) {
      const ctx = mapMarketContext(entry)
      this.marketsContext[ctx.marketId] = ctx
    }
    this.emit('marketsContext', {
      channel: 'marketsContext',
      data: this.marketsContext,
    })
  }

  private handleOrderBook(
    msg: LtWsOrderBookMessage,
    isSnapshot: boolean
  ): void {
    const marketId = this.marketIdFromChannel(msg.channel)
    if (marketId === null) {
      return
    }
    const assetId = String(marketId)

    let state = this.orderbooks.get(marketId)
    if (!state || isSnapshot) {
      state = { bids: new Map(), asks: new Map(), assetId }
      this.orderbooks.set(marketId, state)
    }

    applyLevels(state.bids, msg.order_book.bids)
    applyLevels(state.asks, msg.order_book.asks)

    this.emit(`orderbook:${assetId}`, {
      channel: 'orderbook',
      data: {
        provider: this.providerKey,
        marketId: assetId,
        bids: mapToLevels(
          state.bids,
          (a, b) => Number(b.price) - Number(a.price)
        ),
        asks: mapToLevels(
          state.asks,
          (a, b) => Number(a.price) - Number(b.price)
        ),
        timestamp: Date.now(),
      },
    })
  }

  private marketIdFromChannel(channel: string | undefined): number | null {
    if (!channel?.startsWith('order_book')) {
      return null
    }
    const tail = channel.slice('order_book'.length)
    if (tail.length < 2 || (tail[0] !== '/' && tail[0] !== ':')) {
      return null
    }
    const n = Number(tail.slice(1))
    return Number.isFinite(n) ? n : null
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/**
 * Minimal presence/type check of the discriminating `type` and the required
 * fields the matching handler dereferences without its own guard (currently
 * only `order_book`, whose handler reads `order_book.bids`/`.asks`). A frame
 * that parses but fails this is a bad frame (log + skip), distinct from a
 * handler that throws on otherwise-shaped data. Frames for other types pass
 * through to `dispatch`, which ignores types it does not recognise.
 */
function isValidLighterFrame(msg: LtWsMessage): boolean {
  if (typeof msg.type !== 'string') {
    return false
  }
  if (
    msg.type === 'subscribed/order_book' ||
    msg.type === 'update/order_book'
  ) {
    const book = (msg as { order_book?: unknown }).order_book
    return (
      isObject(book) && Array.isArray(book.bids) && Array.isArray(book.asks)
    )
  }
  return true
}

function applyLevels(
  book: Map<string, string>,
  levels: LtWsOrderBook['bids']
): void {
  for (const level of levels) {
    if (level.size === '0' || Number(level.size) === 0) {
      book.delete(level.price)
    } else {
      book.set(level.price, level.size)
    }
  }
}

function mapToLevels(
  book: Map<string, string>,
  compare: (a: { price: string }, b: { price: string }) => number
): Array<{ price: string; size: string }> {
  const levels = [...book].map(([price, size]) => ({ price, size }))
  levels.sort(compare)
  return levels
}

/**
 * Extract items from an auth-channel payload field. The field may be:
 *   - a flat array (e.g. `trades: []` on the initial subscribed snapshot)
 *   - an object indexed by market index with array values
 *     (e.g. `orders: { "0": [Order] }` on update messages)
 *   - an object indexed by market index with single-object values
 *     (e.g. `positions: { "0": Position }` — one position per market)
 *
 * All three shapes are flattened to a single T[] for uniform downstream
 * handling. Returns undefined when the field is absent, so the caller can
 * fall back to a nested `data` wrapper (kept for compatibility with older
 * Lighter WS versions).
 */
function extractItems<T>(value: unknown): T[] | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (Array.isArray(value)) {
    return value as T[]
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((v) =>
      Array.isArray(v) ? (v as T[]) : [v as T]
    )
  }
  return undefined
}

function collectAuthChannelItems<T>(
  msg: { [k: string]: unknown },
  field: string
): T[] {
  return (
    extractItems<T>(msg[field]) ??
    extractItems<T>(
      (msg.data as Record<string, unknown> | undefined)?.[field]
    ) ??
    []
  )
}

/**
 * `WsProviderFactory` constructor for Lighter — pass to
 * `new PerpsWsClient(client, { wsProviders: { lighter: lighterWsProvider({ authProvider }) } })`.
 *
 * Closes over the per-instance options (auth provider, restUrl override) so
 * `PerpsWsClient` can call the returned factory with just
 * `({ provider, wsUrl, markets })` at subscribe time. `markets` is
 * unused — Lighter advertises a single venue, no sub-DEX filtering.
 *
 * @public
 */
export const lighterWsProvider =
  (options?: LighterWsProviderOptions): WsProviderFactory =>
  ({ provider, wsUrl, client }) =>
    new LighterWsProvider(wsUrl, provider, options, client)
