import type { Subscription, SubscriptionEvent } from '@lifi/perps-types'
import { ReconnectingWebSocket } from '../ReconnectingWebSocket.js'
import type { SubscriptionListener, WsProvider } from '../types.js'
import type {
  LtOrderBookDetail,
  LtOrderBookDetailsResponse,
  LtWsMarketStats,
  LtWsMarketStatsAllMessage,
  LtWsMessage,
  LtWsOrderBook,
  LtWsOrderBookMessage,
} from './types.js'

// ---------------------------------------------------------------------------
// LighterWsProvider
//
// Public-channel only: `prices` (market_stats/all) and `orderbook`
// (order_book/{market_id}). Authenticated channels — orderUpdates, fills,
// positions — require a WASM-signed CreateAuthToken and are a later phase.
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

interface SubState {
  /** Ref count — we send unsubscribe when this drops to zero. */
  count: number
  /** Raw Lighter WS channel name (e.g. `order_book/5`). */
  channel: string
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
}

export class LighterWsProvider implements WsProvider {
  private readonly rws: ReconnectingWebSocket
  private readonly restUrl: string
  private readonly providerKey: string

  private readonly subs = new Map<string, SubState>()
  private readonly listeners = new Map<string, Set<SubscriptionListener>>()
  private readonly orderbooks = new Map<number, OrderbookState>()
  private lastPricesByAssetId: Record<string, string> = {}

  private symbolToMarketId: Map<string, number>
  private marketIdToSymbol: Map<number, string>
  private marketMetadataPromise: Promise<void> | undefined

  private keepaliveTimer: ReturnType<typeof setInterval> | undefined

  constructor(
    wsUrl: string = DEFAULT_WS_URL,
    providerKey = 'lighter',
    options: LighterWsProviderOptions = {}
  ) {
    this.providerKey = providerKey
    this.restUrl = options.restUrl ?? DEFAULT_REST_URL
    this.symbolToMarketId = new Map(Object.entries(options.symbolMap ?? {}))
    this.marketIdToSymbol = new Map(
      [...this.symbolToMarketId].map(([s, m]) => [m, s])
    )

    this.rws = new ReconnectingWebSocket(wsUrl)
    this.rws.on('message', (data) => this.handleMessage(data))
    this.rws.on('open', () => this.onOpen())
    this.rws.on('close', () => this.stopKeepalive())
  }

  async subscribe(
    sub: Subscription,
    listener: SubscriptionListener
  ): Promise<() => void> {
    await this.ensureMarketMetadata()

    const key = this.toKey(sub)
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key)?.add(listener)

    const channel = this.toLighterChannel(sub)
    const existing = this.subs.get(key)
    if (existing) {
      existing.count++
    } else {
      this.subs.set(key, { count: 1, channel })
      await this.rws.ready()
      this.rws.send(JSON.stringify({ type: 'subscribe', channel }))
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

  private onOpen(): void {
    this.startKeepalive()
    for (const [, s] of this.subs) {
      this.rws.send(JSON.stringify({ type: 'subscribe', channel: s.channel }))
    }
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
      case 'candle':
      case 'orderUpdates':
      case 'fills':
      case 'positions':
      case 'spotBalances':
        throw new Error(
          `Lighter WS does not support channel: ${sub.channel}. ` +
            'Candle/auth channels will be added in a later phase.'
        )
    }
  }

  private toLighterChannel(sub: Subscription): string {
    if (sub.channel === 'prices') {
      return 'market_stats/all'
    }
    if (sub.channel === 'orderbook') {
      const id = this.symbolToMarketId.get(sub.assetId)
      if (id === undefined) {
        throw new Error(
          `Lighter WS: unknown market for assetId '${sub.assetId}'. ` +
            'Is the symbol mapping out of date?'
        )
      }
      return `order_book/${id}`
    }
    throw new Error(`Unsupported Lighter WS subscription: ${sub.channel}`)
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
