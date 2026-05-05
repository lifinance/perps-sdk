import type {
  Address,
  Fill,
  Order,
  Position,
  Subscription,
  SubscriptionEvent,
} from '@lifi/perps-types'
import type {
  LtAccountPosition,
  LtOrder,
  LtTrade,
} from '@lifi/perps-types/providers/lighter'
import {
  mapFill,
  mapOrderDetail,
  mapPosition,
} from '@lifi/perps-types/providers/lighter'
import { ReconnectingWebSocket } from '../ReconnectingWebSocket.js'
import type { SubscriptionListener, WsProvider } from '../types.js'
import type {
  LtOrderBookDetail,
  LtOrderBookDetailsResponse,
  LtWsAccountAllOrdersMessage,
  LtWsAccountAllPositionsMessage,
  LtWsAccountAllTradesMessage,
  LtWsAccountByL1Response,
  LtWsMarketStats,
  LtWsMarketStatsAllMessage,
  LtWsMessage,
  LtWsOrderBook,
  LtWsOrderBookMessage,
} from './types.js'

// ---------------------------------------------------------------------------
// LighterWsProvider
//
// Public channels: `prices` (market_stats/all), `orderbook` (order_book/N).
// Authenticated channels (require an `authProvider` option):
//   - orderUpdates → account_all_orders/{account_index}
//   - fills        → account_all_trades/{account_index}
//   - positions    → account_all_positions/{account_index}
//
// Auth pattern (per Lighter WS spec): the subscribe payload carries the
// token directly — `{ type: "subscribe", channel: "...", auth: "<token>" }`.
// Tokens are minted via the Lighter WASM signer (CreateAuthToken) by the
// caller; we re-request a fresh token on every subscribe send so reconnects
// after the original token expires automatically pick up a new one.
//
// account_index is resolved per-address via `/api/v1/account?by=l1_address`
// and cached for the lifetime of the provider — Lighter's account index is
// stable for a given L1 wallet.
//
// Symbol → market_id mapping is fetched once from Lighter's public
// `/api/v1/orderBookDetails` endpoint. The UI's assetId IS Lighter's symbol
// (e.g. "BTC"), so we use it as the join key.
//
// Orderbook is stateful: the first message is a full snapshot, subsequent
// messages are deltas where size=0 deletes a level.
// ---------------------------------------------------------------------------

const DEFAULT_WS_URL = 'wss://mainnet.zklighter.elliot.ai/stream'
const DEFAULT_REST_URL = 'https://mainnet.zklighter.elliot.ai'
const KEEPALIVE_INTERVAL_MS = 30_000

const LIGHTER_AUTH_CHANNEL = {
  orderUpdates: 'account_all_orders',
  fills: 'account_all_trades',
  positions: 'account_all_positions',
} as const

/**
 * Mints a fresh Lighter auth token for the given L1 address, or returns
 * `undefined` if no API key is registered. Called both on initial subscribe
 * and on every reconnect, so it must always return a token valid for at
 * least the next few minutes.
 */
export type LighterAuthProvider = (
  address: Address
) => Promise<string | undefined>

interface SubState {
  /** Ref count — we send unsubscribe when this drops to zero. */
  count: number
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

export interface LighterWsProviderOptions {
  /** REST base URL for fetching `orderBookDetails`. Defaults to mainnet. */
  restUrl?: string
  /** Pre-populated symbol→market_id map to skip the REST call. */
  symbolMap?: Record<string, number>
  /**
   * Async function returning a Lighter auth token for an address. Required
   * for authenticated channels (orderUpdates, positions). Without it those
   * subscriptions will throw at subscribe time.
   */
  authProvider?: LighterAuthProvider
}

export class LighterWsProvider implements WsProvider {
  private readonly rws: ReconnectingWebSocket
  private readonly restUrl: string
  private readonly providerKey: string
  private readonly authProvider: LighterAuthProvider | undefined

  private readonly subs = new Map<string, SubState>()
  private readonly listeners = new Map<string, Set<SubscriptionListener>>()
  private readonly orderbooks = new Map<number, OrderbookState>()
  private lastPricesByAssetId: Record<string, string> = {}

  private symbolToMarketId: Map<string, number>
  private marketIdToSymbol: Map<number, string>
  private marketMetadataPromise: Promise<void> | undefined

  private readonly accountIndexCache = new Map<string, number>()
  private readonly accountIndexPromises = new Map<string, Promise<number>>()

  private keepaliveTimer: ReturnType<typeof setInterval> | undefined

  constructor(
    wsUrl: string = DEFAULT_WS_URL,
    providerKey = 'lighter',
    options: LighterWsProviderOptions = {}
  ) {
    this.providerKey = providerKey
    this.restUrl = options.restUrl ?? DEFAULT_REST_URL
    this.authProvider = options.authProvider
    this.symbolToMarketId = new Map(Object.entries(options.symbolMap ?? {}))
    this.marketIdToSymbol = new Map(
      [...this.symbolToMarketId].map(([s, m]) => [m, s])
    )

    this.rws = new ReconnectingWebSocket(wsUrl)
    this.rws.on('message', (data) => this.handleMessage(data))
    this.rws.on('open', () => {
      void this.onOpen()
    })
    this.rws.on('close', () => this.stopKeepalive())
  }

  async subscribe(
    sub: Subscription,
    listener: SubscriptionListener
  ): Promise<() => void> {
    // Lighter has no live OHLC channel — there's nothing to subscribe to.
    // Return a no-op unsubscribe so the caller's UX (chart still rendering
    // from REST history + price-tick mid line) is unaffected, instead of
    // throwing and surfacing a console error on every chart mount.
    if (sub.channel === 'candle') {
      void listener
      return () => {}
    }

    await this.ensureMarketMetadata()

    const { channel, needsAuth, address } = await this.resolveChannel(sub)
    const key = this.toKey(sub)
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key)?.add(listener)

    const existing = this.subs.get(key)
    if (existing) {
      existing.count++
    } else {
      this.subs.set(key, { count: 1, channel, needsAuth, address })
      await this.rws.ready()
      await this.sendSubscribe(channel, needsAuth, address)
    }

    return () => {
      this.listeners.get(key)?.delete(listener)
      const s = this.subs.get(key)
      if (!s) {
        return
      }
      s.count--
      if (s.count <= 0) {
        this.subs.delete(key)
        this.listeners.delete(key)
        if (sub.channel === 'orderbook') {
          const id = this.symbolToMarketId.get(sub.assetId)
          if (id !== undefined) {
            this.orderbooks.delete(id)
          }
        }
        this.rws.send(
          JSON.stringify({ type: 'unsubscribe', channel: s.channel })
        )
      }
    }
  }

  close(): void {
    this.stopKeepalive()
    this.rws.close()
    this.subs.clear()
    this.listeners.clear()
    this.orderbooks.clear()
    this.lastPricesByAssetId = {}
  }

  private async onOpen(): Promise<void> {
    this.startKeepalive()
    for (const [, s] of this.subs) {
      await this.sendSubscribe(s.channel, s.needsAuth, s.address)
    }
  }

  private async sendSubscribe(
    channel: string,
    needsAuth: boolean,
    address: Address | undefined
  ): Promise<void> {
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

  private startKeepalive(): void {
    this.stopKeepalive()
    this.keepaliveTimer = setInterval(() => {
      this.rws.send(JSON.stringify({ type: 'ping' }))
    }, KEEPALIVE_INTERVAL_MS)
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer !== undefined) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = undefined
    }
  }

  private toKey(sub: Subscription): string {
    switch (sub.channel) {
      case 'prices':
        return 'prices'
      case 'orderbook':
        return `orderbook:${sub.assetId}`
      case 'orderUpdates':
        return `orderUpdates:${sub.address.toLowerCase()}`
      case 'fills':
        return `fills:${sub.address.toLowerCase()}`
      case 'positions':
        return `positions:${sub.address.toLowerCase()}`
      case 'candle':
      case 'spotBalances':
        throw new Error(`Lighter WS does not support channel: ${sub.channel}.`)
    }
  }

  private async resolveChannel(sub: Subscription): Promise<{
    channel: string
    needsAuth: boolean
    address?: Address
  }> {
    if (sub.channel === 'prices') {
      return { channel: 'market_stats/all', needsAuth: false }
    }
    if (sub.channel === 'orderbook') {
      const id = this.symbolToMarketId.get(sub.assetId)
      if (id === undefined) {
        throw new Error(
          `Lighter WS: unknown market for assetId '${sub.assetId}'. ` +
            'Is the symbol mapping out of date?'
        )
      }
      return { channel: `order_book/${id}`, needsAuth: false }
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
      return {
        channel: `${lighterChannel}/${accountIndex}`,
        needsAuth,
        address: sub.address,
      }
    }
    throw new Error(
      `Lighter WS does not support channel: ${(sub as { channel: string }).channel}.`
    )
  }

  private async resolveAccountIndex(address: Address): Promise<number> {
    const lc = address.toLowerCase()
    const cached = this.accountIndexCache.get(lc)
    if (cached !== undefined) {
      return cached
    }
    let p = this.accountIndexPromises.get(lc)
    if (!p) {
      p = this.fetchAccountIndex(address).finally(() => {
        this.accountIndexPromises.delete(lc)
      })
      this.accountIndexPromises.set(lc, p)
    }
    const idx = await p
    this.accountIndexCache.set(lc, idx)
    return idx
  }

  private async fetchAccountIndex(address: Address): Promise<number> {
    const url = `${this.restUrl}/api/v1/account?by=l1_address&value=${encodeURIComponent(address)}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `Failed to resolve Lighter account for ${address}: ${response.status}`
      )
    }
    const body = (await response.json()) as LtWsAccountByL1Response
    const idx = body.accounts?.[0]?.index
    if (typeof idx !== 'number') {
      throw new Error(`No Lighter account found for ${address}`)
    }
    return idx
  }

  private async ensureMarketMetadata(): Promise<void> {
    if (this.symbolToMarketId.size > 0) {
      return
    }
    if (!this.marketMetadataPromise) {
      this.marketMetadataPromise = this.fetchMarketMetadata()
    }
    await this.marketMetadataPromise
  }

  private async fetchMarketMetadata(): Promise<void> {
    const response = await fetch(`${this.restUrl}/api/v1/orderBookDetails`)
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Lighter orderBookDetails: ${response.status}`
      )
    }
    const body = (await response.json()) as LtOrderBookDetailsResponse
    for (const d of body.order_book_details ?? []) {
      this.registerMarket(d)
    }
  }

  private registerMarket(d: LtOrderBookDetail): void {
    this.symbolToMarketId.set(d.symbol, d.market_id)
    this.marketIdToSymbol.set(d.market_id, d.symbol)
  }

  private handleMessage(raw: string): void {
    let msg: LtWsMessage
    try {
      msg = JSON.parse(raw) as LtWsMessage
    } catch {
      return
    }

    if (msg.type === 'ping') {
      this.rws.send(JSON.stringify({ type: 'pong' }))
      return
    }

    if (
      msg.type === 'subscribed/market_stats' ||
      msg.type === 'update/market_stats'
    ) {
      this.handleMarketStats(msg as LtWsMarketStatsAllMessage)
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
      this.handleAccountPositions(msg as LtWsAccountAllPositionsMessage)
      return
    }
  }

  private handleAccountOrders(msg: LtWsAccountAllOrdersMessage): void {
    const address = this.addressFromChannel(msg.channel, 'account_all_orders')
    if (!address) {
      return
    }
    const raw = collectAuthChannelItems<LtOrder>(msg, 'orders')
    const orders: Order[] = raw.map((o) =>
      mapOrderDetail(
        o,
        this.marketIdToSymbol.get(o.market_index) ?? `market_${o.market_index}`
      )
    )
    this.emit(`orderUpdates:${address}`, {
      channel: 'orderUpdates',
      data: orders,
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
    const fills: Fill[] = raw.map((t) =>
      mapFill(
        t,
        accountIndex,
        this.marketIdToSymbol.get(t.market_id) ?? `market_${t.market_id}`
      )
    )
    this.emit(`fills:${address}`, { channel: 'fills', data: fills })
  }

  private handleAccountPositions(msg: LtWsAccountAllPositionsMessage): void {
    const address = this.addressFromChannel(
      msg.channel,
      'account_all_positions'
    )
    if (!address) {
      return
    }
    const raw = collectAuthChannelItems<LtAccountPosition>(msg, 'positions')
    const positions: Position[] = raw.map((p) =>
      mapPosition(
        p,
        this.marketIdToSymbol.get(p.market_id) ??
          p.symbol ??
          `market_${p.market_id}`
      )
    )
    this.emit(`positions:${address}`, {
      channel: 'positions',
      data: positions,
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
    if (!channel || !channel.startsWith(prefix)) {
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

  private handleMarketStats(msg: LtWsMarketStatsAllMessage): void {
    const stats = msg.market_stats
    if (!stats) {
      return
    }
    const updates: Record<string, string> = {}
    for (const value of Object.values(stats)) {
      const entry = value as LtWsMarketStats
      const symbol = this.marketIdToSymbol.get(entry.market_id)
      if (!symbol) {
        continue
      }
      updates[symbol] = entry.last_trade_price
    }
    if (Object.keys(updates).length === 0) {
      return
    }
    this.lastPricesByAssetId = { ...this.lastPricesByAssetId, ...updates }
    this.emit('prices', {
      channel: 'prices',
      data: this.lastPricesByAssetId,
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
    const assetId = this.marketIdToSymbol.get(marketId)
    if (!assetId) {
      return
    }

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
        assetId,
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

  private emit(key: string, event: SubscriptionEvent): void {
    const fns = this.listeners.get(key)
    if (!fns) {
      return
    }
    for (const fn of fns) {
      fn(event)
    }
  }
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
