import {
  ACTIVE_ORDER_STATUSES,
  getMarketRegistry,
  localStorageAdapter,
  type MarketRegistry,
  PerpsError,
  type PerpsSDKClient,
  type ProviderGetQuoteParams,
  type QuoteListener,
  ReconnectingWebSocket,
  resolveSubscribeQuote,
  type StorageAdapter,
  toMarketDisplay,
  toPerpsMarketDisplay,
  WsProviderBase,
  type WsProviderFactory,
  type WsProviderFactoryParams,
  wsLog,
} from '@lifi/perps-sdk'
import {
  type Address,
  type MarketContext,
  type OhlcvInterval,
  type Order,
  type OrderbookLevel,
  PerpsErrorCode,
  type Position,
  type Subscription,
} from '@lifi/perps-types'
import { ExtendedCredentialStore } from '../auth/ExtendedCredentialStore.js'
import {
  DEFAULT_EXTENDED_API_URL,
  DEFAULT_EXTENDED_WS_URL,
  EXTENDED_BASE_FEE_TIER,
  EXTENDED_PROVIDER_KEY,
} from '../constants.js'
import type {
  ExtendedBalance,
  ExtendedOrder,
  ExtendedPosition,
  ExtendedTrade,
} from '../types/wire.js'
import { mapFill } from '../utils/mapFill.js'
import { mapOrder, mapOrderStatus } from '../utils/mapOrder.js'
import { mapPosition } from '../utils/mapPosition.js'
import { parseVenueJson } from '../utils/parseVenueJson.js'

// One v2 JSON-RPC connection carries every stream. The venue names each
// subscription (`orderbooks.BTC-USD`, `account.330870`), and every data frame
// repeats that name, so the name is the wire key and the routing key.

/** JSON-RPC error that Extended returns for a refused account API key. */
const INVALID_AUTH_TOKEN_CODE = -32602

const ACCOUNT_CHANNELS = [
  'orderUpdates',
  'fills',
  'positions',
  'accountSummary',
] as const

type AccountSubscription = Extract<
  Subscription,
  { channel: (typeof ACCOUNT_CHANNELS)[number] }
>

const isAccountSubscription = (sub: Subscription): sub is AccountSubscription =>
  ACCOUNT_CHANNELS.some((channel) => channel === sub.channel)

const INTERVALS: Partial<Record<OhlcvInterval, string>> = {
  '1m': 'PT1M',
  '5m': 'PT5M',
  '15m': 'PT15M',
  '30m': 'PT30M',
  '1h': 'PT1H',
  '2h': 'PT2H',
  '4h': 'PT4H',
  '8h': 'PT8H',
  '12h': 'PT12H',
  '1d': 'PT24H',
  '1w': 'P7D',
  '1M': 'P30D',
}

const HOUR_MS = 3_600_000

interface SubState {
  params: { scope: string; selector: Record<string, unknown> }
  /** Set on the account wire: the API key is read from the store per send. */
  address?: Address
  /** Channel key a candle wire emits to; candle frames do not name the market. */
  candleKey?: string
}

interface Envelope {
  id?: string
  error?: { code?: number; message?: string }
  type?: string
  data?: unknown
  seq?: number
  subscription?: string
}

/** Book side by price string; `rank` orders the levels and is never shown. */
type BookSide = Map<string, { size: string; rank: number }>

interface AccountState {
  address: Address
  positions: Map<string, ExtendedPosition>
  balance: ExtendedBalance | undefined
}

/**
 * Options for {@link extendedWsProvider} / {@link ExtendedWsProvider}.
 *
 * @public
 */
export interface ExtendedWsProviderOptions {
  /** Extended host that namespaces the stored credentials. Defaults to mainnet. */
  apiUrl?: string
  /** Credential persistence backend. Defaults to browser `localStorage`. */
  storage?: StorageAdapter
}

/**
 * Extended WebSocket provider on the venue's v2 JSON-RPC stream. Public
 * channels need no credential. The account channels share one `account`
 * subscription per address, which carries the stored API key in the
 * subscribe message; a refused key removes the credentials and rejects those
 * channels with `Unauthorized`. A gap in the connection's `seq` counter
 * reconnects, and the base replays every subscription for fresh snapshots.
 *
 * @public
 */
export class ExtendedWsProvider extends WsProviderBase<SubState> {
  private readonly credentialStore: ExtendedCredentialStore
  private readonly client: PerpsSDKClient | undefined
  private readonly registry: MarketRegistry | undefined

  private nextRequestId = 1
  /** Subscribe requests waiting for the venue's answer, by request id. */
  private readonly pendingRequests = new Map<string, string>()
  private lastSeq: number | undefined
  private contexts: Record<string, MarketContext> = {}
  private pendingFunding = new Map<string, MarketContext['funding']>()
  private books = new Map<string, { bids: BookSide; asks: BookSide }>()
  /** Account state per account wire key. */
  private accounts = new Map<string, AccountState>()
  /** Channels that hold each account wire, so the last release drops it. */
  private readonly accountWireRefs = new Map<string, number>()

  constructor(
    wsUrl: string = DEFAULT_EXTENDED_WS_URL,
    providerKey = EXTENDED_PROVIDER_KEY,
    options: ExtendedWsProviderOptions = {},
    client?: PerpsSDKClient
  ) {
    super(
      new ReconnectingWebSocket(wsUrl, {
        pingPayload: '{"jsonrpc":"2.0","id":0,"method":"ping"}',
      }),
      providerKey
    )
    this.credentialStore = new ExtendedCredentialStore(
      options.storage ?? localStorageAdapter,
      options.apiUrl ?? DEFAULT_EXTENDED_API_URL
    )
    this.client = client
    this.registry = client && getMarketRegistry(client, providerKey)
    // `seq` counts per connection, and the replay sends fresh snapshots.
    this.rws.on('close', () => this.onClose())
  }

  async subscribeQuote(
    params: ProviderGetQuoteParams,
    onQuote: QuoteListener
  ): Promise<() => void> {
    if (this.client === undefined) {
      throw new Error(
        'ExtendedWsProvider: PerpsSDKClient not provided; cannot stream quotes. ' +
          'Construct via `extendedWsProvider({...})` and register with PerpsWsClient.'
      )
    }
    return resolveSubscribeQuote(
      this.client,
      this.providerKey,
      this,
      params,
      EXTENDED_BASE_FEE_TIER,
      onQuote
    )
  }

  protected toKey(sub: Subscription): string {
    switch (sub.channel) {
      case 'marketsContext':
        return 'marketsContext'
      case 'marketContext':
        return `marketContext:${sub.marketId}`
      case 'orderbook':
        return `orderbook:${sub.marketId}`
      case 'trades':
        return `trades:${sub.marketId}`
      case 'candle':
        return `candle:${sub.marketId}:${sub.interval}`
      case 'orderUpdates':
      case 'fills':
      case 'positions':
      case 'accountSummary':
        return `${sub.channel}:${sub.address.toLowerCase()}`
      case 'spotBalances':
      case 'availableToTrade':
        throw new Error(`Extended WS does not support channel: ${sub.channel}.`)
    }
  }

  protected async openChannel(sub: Subscription): Promise<() => void> {
    if (isAccountSubscription(sub)) {
      return this.openAccountChannel(sub)
    }
    const wires = this.publicWires(sub)
    return this.openWires(
      async () => {
        for (const [key, state] of wires) {
          await this.registerSub(key, state)
        }
      },
      () => {
        for (const [key, state] of wires) {
          this.releaseWire(key, state)
        }
      }
    )
  }

  private publicWires(sub: Subscription): Array<[string, SubState]> {
    switch (sub.channel) {
      case 'marketsContext':
        return [
          [
            'prices.mark.all',
            { params: { scope: 'prices', selector: { type: 'mark' } } },
          ],
          [
            'funding-rates.all',
            { params: { scope: 'funding-rates', selector: {} } },
          ],
        ]
      case 'marketContext':
        return [
          [
            `prices.mark.${sub.marketId}`,
            {
              params: {
                scope: 'prices',
                selector: { market: sub.marketId, type: 'mark' },
              },
            },
          ],
          [
            `funding-rates.${sub.marketId}`,
            {
              params: {
                scope: 'funding-rates',
                selector: { market: sub.marketId },
              },
            },
          ],
        ]
      case 'orderbook':
        return [
          [
            `orderbooks.${sub.marketId}`,
            {
              params: {
                scope: 'orderbooks',
                selector: {
                  market: sub.marketId,
                  depth: 'full',
                  rfqOnly: false,
                },
              },
            },
          ],
        ]
      case 'trades':
        return [
          [
            `trades.${sub.marketId}`,
            { params: { scope: 'trades', selector: { market: sub.marketId } } },
          ],
        ]
      case 'candle': {
        const interval = INTERVALS[sub.interval]
        if (interval === undefined) {
          throw new PerpsError(
            PerpsErrorCode.ValidationError,
            `Extended streams no ${sub.interval} candles.`
          )
        }
        return [
          [
            `candles.last.${sub.marketId}.${interval}`,
            {
              params: {
                scope: 'candles',
                selector: { market: sub.marketId, type: 'last', interval },
              },
              candleKey: this.toKey(sub),
            },
          ],
        ]
      }
      default:
        return []
    }
  }

  private async openAccountChannel(
    sub: AccountSubscription
  ): Promise<() => void> {
    const credentials = await this.credentialStore.get(sub.address)
    if (credentials === null) {
      throw new PerpsError(
        PerpsErrorCode.SetupRequired,
        `No Extended credentials for ${sub.address}. Run the Extended setup before subscribing to account channels.`
      )
    }
    await this.registry?.sync()
    const key = `account.${credentials.accountId}`
    const state: SubState = {
      params: {
        scope: 'account',
        selector: { account: credentials.accountId },
      },
      address: sub.address,
    }
    const count = this.accountWireRefs.get(key) ?? 0
    this.accountWireRefs.set(key, count + 1)
    const register = async () => {
      if (count === 0) {
        this.accounts.set(key, {
          address: sub.address,
          positions: new Map(),
          balance: undefined,
        })
        await this.registerSub(key, state)
      }
    }
    return this.openWires(register, () => {
      const remaining = (this.accountWireRefs.get(key) ?? 1) - 1
      if (remaining > 0) {
        this.accountWireRefs.set(key, remaining)
        return
      }
      this.accountWireRefs.delete(key)
      this.accounts.delete(key)
      this.releaseWire(key, state)
    })
  }

  private releaseWire(key: string, state: SubState): void {
    if (this.wireSubs.get(key) !== state) {
      return
    }
    this.unregisterSub(key)
    this.sendRequest('unsubscribe', { subscription: key })
  }

  protected override resolveChannelKeys(
    key: string,
    state: SubState
  ): string[] {
    if (state.address === undefined) {
      return super.resolveChannelKeys(key, state)
    }
    const address = state.address.toLowerCase()
    return ACCOUNT_CHANNELS.map((channel) => `${channel}:${address}`)
  }

  protected async sendSubscribe(state: SubState): Promise<void> {
    if (state.address === undefined) {
      this.sendRequest('subscribe', state.params, this.keyOf(state))
      return
    }
    const credentials = await this.credentialStore.get(state.address)
    if (credentials === null) {
      throw new PerpsError(
        PerpsErrorCode.SetupRequired,
        `No Extended credentials for ${state.address}. Run the Extended setup again.`
      )
    }
    this.sendRequest(
      'subscribe',
      { ...state.params, apiKey: credentials.apiKey },
      this.keyOf(state)
    )
  }

  private keyOf(state: SubState): string | undefined {
    for (const [key, registered] of this.wireSubs) {
      if (registered === state) {
        return key
      }
    }
    return undefined
  }

  private sendRequest(
    method: 'subscribe' | 'unsubscribe',
    params: Record<string, unknown>,
    key?: string
  ): void {
    const id = String(this.nextRequestId++)
    if (key !== undefined) {
      this.pendingRequests.set(id, key)
    }
    this.rws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
  }

  protected override onClose(): void {
    this.lastSeq = undefined
    this.pendingRequests.clear()
    this.contexts = {}
    this.pendingFunding.clear()
    this.books.clear()
    for (const account of this.accounts.values()) {
      account.positions.clear()
      account.balance = undefined
    }
  }

  protected handleMessage(raw: string): void {
    try {
      const message = parseVenueJson(raw) as Envelope
      if (message.id !== undefined) {
        this.handleReply(message)
        return
      }
      if (message.seq !== undefined) {
        const expected =
          this.lastSeq === undefined ? message.seq : this.lastSeq + 1
        this.lastSeq = message.seq
        if (message.seq !== expected) {
          // A lost frame leaves a book or an account state wrong: start over.
          this.rws.reconnect()
          return
        }
      }
      if (message.subscription !== undefined) {
        this.route(message.subscription, message.type ?? '', message.data)
      }
    } catch (error) {
      wsLog.handlerFailure(this.providerKey, error)
    }
  }

  private handleReply(message: Envelope): void {
    const key = this.pendingRequests.get(String(message.id))
    this.pendingRequests.delete(String(message.id))
    if (message.error === undefined || key === undefined) {
      return
    }
    const state = this.wireSubs.get(key)
    if (
      state?.address !== undefined &&
      message.error.code === INVALID_AUTH_TOKEN_CODE
    ) {
      void this.rejectAccount(key, state)
      return
    }
    wsLog.subscribeFailure(
      this.providerKey,
      key,
      new Error(message.error.message ?? `code ${message.error.code}`)
    )
  }

  private async rejectAccount(key: string, state: SubState): Promise<void> {
    if (state.address === undefined) {
      return
    }
    this.unregisterSub(key)
    this.accountWireRefs.delete(key)
    this.accounts.delete(key)
    await this.credentialStore.remove(state.address)
    const error = new PerpsError(
      PerpsErrorCode.Unauthorized,
      `Extended refused the stored API key for ${state.address}. Run the Extended setup again.`
    )
    for (const channelKey of this.resolveChannelKeys(key, state)) {
      this.rejectChannel(channelKey, error)
    }
  }

  private route(subscription: string, type: string, data: unknown): void {
    if (subscription.startsWith('orderbooks.')) {
      this.handleBook(type, data as BookFrame)
    } else if (subscription.startsWith('prices.mark.')) {
      this.handleMarkPrice(data as { m: string; p: string })
    } else if (subscription.startsWith('funding-rates.')) {
      this.handleFunding(data as { m: string; f: string; T: number })
    } else if (subscription.startsWith('trades.')) {
      this.handleTrades(data as PublicTrade[])
    } else if (subscription.startsWith('candles.')) {
      this.handleCandles(subscription, data as CandleFrame[])
    } else if (subscription.startsWith('account.')) {
      this.handleAccount(subscription, type, data as AccountFrame)
    }
  }

  private handleBook(type: string, frame: BookFrame): void {
    const snapshot = type.endsWith('SNAPSHOT')
    const existing = this.books.get(frame.m)
    if (!snapshot && existing === undefined) {
      return
    }
    const book =
      snapshot || existing === undefined
        ? { bids: new Map(), asks: new Map() }
        : existing
    for (const [side, rows] of [
      [book.bids, frame.b ?? []],
      [book.asks, frame.a ?? []],
    ] as const) {
      for (const row of rows) {
        // A snapshot level carries its size in `q`; a delta level carries the
        // change in `q` and the resulting size in `c`.
        const size = snapshot ? row.q : row.c
        if (size === undefined) {
          wsLog.skippedRow(
            this.providerKey,
            'order book level',
            'c',
            size,
            frame.m
          )
          continue
        }
        if (Number(size) === 0) {
          side.delete(row.p)
        } else {
          side.set(row.p, { size, rank: Number(row.p) })
        }
      }
    }
    this.books.set(frame.m, book)
    this.emit(`orderbook:${frame.m}`, {
      channel: 'orderbook',
      data: {
        provider: this.providerKey,
        marketId: frame.m,
        bids: toLevels(book.bids, -1),
        asks: toLevels(book.asks, 1),
        timestamp: Date.now(),
      },
    })
  }

  private handleMarkPrice({ m, p }: { m: string; p: string }): void {
    const context: MarketContext = {
      ...this.contexts[m],
      provider: this.providerKey,
      marketId: m,
      markPrice: p,
    }
    const funding = this.pendingFunding.get(m)
    if (funding !== undefined) {
      context.funding = funding
      this.pendingFunding.delete(m)
    }
    this.contexts[m] = context
    this.emitContext(m)
  }

  private handleFunding({
    m,
    f,
    T,
  }: {
    m: string
    f: string
    T: number
  }): void {
    // Extended applies the hourly rate on the hour.
    const funding = {
      rate: f,
      nextFundingTime: Math.ceil(T / HOUR_MS) * HOUR_MS,
    }
    const context = this.contexts[m]
    if (context === undefined) {
      this.pendingFunding.set(m, funding)
      return
    }
    this.contexts[m] = { ...context, funding }
    this.emitContext(m)
  }

  private emitContext(market: string): void {
    const context = this.contexts[market]
    if (context === undefined) {
      return
    }
    this.emit(`marketContext:${market}`, {
      channel: 'marketContext',
      data: context,
    })
    this.emitMarketsContext(() => ({ ...this.contexts }))
  }

  private handleTrades(trades: PublicTrade[]): void {
    const byMarket = new Map<string, PublicTrade[]>()
    for (const trade of trades) {
      byMarket.set(trade.m, [...(byMarket.get(trade.m) ?? []), trade])
    }
    for (const [market, batch] of byMarket) {
      this.emit(`trades:${market}`, {
        channel: 'trades',
        data: batch.map((trade) => ({
          provider: this.providerKey,
          marketId: market,
          price: trade.p,
          size: trade.q,
          timestamp: trade.T,
          side: trade.S === 'BUY' ? 'buy' : 'sell',
          id: String(trade.i),
        })),
      })
    }
  }

  private handleCandles(subscription: string, candles: CandleFrame[]): void {
    const key = this.wireSubs.get(subscription)?.candleKey
    if (key === undefined) {
      return
    }
    for (const candle of candles) {
      this.emit(key, {
        channel: 'candle',
        data: {
          t: candle.T,
          o: candle.o,
          h: candle.h,
          l: candle.l,
          c: candle.c,
          v: candle.v ?? '0',
        },
      })
    }
  }

  private handleAccount(
    subscription: string,
    type: string,
    frame: AccountFrame
  ): void {
    const account = this.accounts.get(subscription)
    if (account === undefined) {
      return
    }
    const address = account.address.toLowerCase()
    switch (type) {
      case 'ACCOUNT.ORDER':
        this.emitOrders(address, frame.orders ?? [])
        return
      case 'ACCOUNT.TRADE':
        this.emitFills(address, frame.trades ?? [])
        return
      case 'ACCOUNT.POSITION':
        if (frame.isSnapshot === true) {
          account.positions.clear()
        }
        for (const position of frame.positions ?? []) {
          if (Number(position.size) === 0) {
            account.positions.delete(position.market)
          } else {
            account.positions.set(position.market, position)
          }
        }
        this.emitPositions(address, account)
        return
      case 'ACCOUNT.BALANCE':
        account.balance = frame.balance
        this.emitAccountSummary(address, account)
        return
    }
  }

  private marketDisplay(market: string) {
    const found = this.registry?.get(market)
    return found === undefined ? undefined : toMarketDisplay(found)
  }

  private emitOrders(address: string, rows: ExtendedOrder[]): void {
    const orders: Order[] = []
    const terminated: string[] = []
    for (const row of rows) {
      try {
        const display = this.marketDisplay(row.market)
        const status = mapOrderStatus(row.status)
        if (!ACTIVE_ORDER_STATUSES.has(status)) {
          terminated.push(String(row.id))
        }
        if (display !== undefined) {
          orders.push(...mapOrder(row, display))
        }
      } catch (error) {
        if (!(error instanceof PerpsError)) {
          throw error
        }
        wsLog.droppedRow(
          this.providerKey,
          'order',
          `${String(row.id)}: ${error.message}`
        )
      }
    }
    this.emit(`orderUpdates:${address}`, {
      channel: 'orderUpdates',
      data: { orders, terminated },
    })
  }

  private emitFills(address: string, trades: ExtendedTrade[]): void {
    const fills = trades.flatMap((trade) => {
      const display = this.marketDisplay(trade.market)
      return display === undefined ? [] : [mapFill(trade, display)]
    })
    this.emit(`fills:${address}`, { channel: 'fills', data: fills })
  }

  private emitPositions(address: string, account: AccountState): void {
    const positions: Position[] = []
    for (const row of account.positions.values()) {
      const found = this.registry?.get(row.market)
      const position =
        found === undefined
          ? undefined
          : mapPosition(row, toPerpsMarketDisplay(found))
      if (position !== undefined) {
        positions.push(position)
      }
    }
    this.emit(`positions:${address}`, { channel: 'positions', data: positions })
  }

  private emitAccountSummary(address: string, account: AccountState): void {
    const balance = account.balance
    if (balance === undefined) {
      return
    }
    this.emit(`accountSummary:${address}`, {
      channel: 'accountSummary',
      data: {
        portfolioValue: balance.equity,
        availableMargin: balance.availableForTrade,
        marginUsed: balance.initialMargin,
        unrealizedPnl: balance.unrealisedPnl,
      },
    })
  }
}

interface BookFrame {
  m: string
  b?: { p: string; q: string; c?: string }[]
  a?: { p: string; q: string; c?: string }[]
}

interface PublicTrade {
  i: string | number
  m: string
  S: 'BUY' | 'SELL'
  T: number
  p: string
  q: string
}

interface CandleFrame {
  T: number
  o: string
  h: string
  l: string
  c: string
  v?: string
}

interface AccountFrame {
  isSnapshot?: boolean
  orders?: ExtendedOrder[]
  trades?: ExtendedTrade[]
  positions?: ExtendedPosition[]
  balance?: ExtendedBalance
}

/** Levels of one side, best first (`-1` bids, `1` asks). */
const toLevels = (side: BookSide, direction: 1 | -1): OrderbookLevel[] =>
  [...side]
    .sort(([, a], [, b]) => direction * (a.rank - b.rank))
    .map(([price, { size }]) => ({ price, size }))

/**
 * Factory for registering the Extended WS provider with `PerpsWsClient`:
 * `new PerpsWsClient(client, { wsProviders: { extended: extendedWsProvider() } })`.
 *
 * @public
 */
export const extendedWsProvider = (
  options?: ExtendedWsProviderOptions
): WsProviderFactory =>
  Object.assign(
    ({ provider, wsUrl, client }: WsProviderFactoryParams) =>
      new ExtendedWsProvider(wsUrl, provider, options, client),
    { streamsCandles: true, streamsAvailableToTrade: false }
  )
