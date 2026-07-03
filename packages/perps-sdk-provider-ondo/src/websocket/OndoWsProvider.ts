import {
  getMarketRegistry,
  localStorageAdapter,
  type MarketRegistry,
  type PerpsSDKClient,
  type ProviderGetQuoteParams,
  type QuoteListener,
  ReconnectingWebSocket,
  resolveSubscribeQuote,
  type StorageAdapter,
  toMarketDisplay,
  WsProviderBase,
  type WsProviderFactory,
  wsLog,
} from '@lifi/perps-sdk'
import type {
  MarketContext,
  MarketDisplay,
  Subscription,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import { OndoTokenStore } from '../auth/OndoTokenStore.js'
import {
  DEFAULT_ONDO_API_URL,
  DEFAULT_ONDO_WS_URL,
  ONDO_BASE_FEE_TIER,
  ONDO_PROVIDER_KEY,
} from '../constants.js'
import type {
  OnBookSnapshot,
  OnFill,
  OnFundingRate,
  OnKline,
  OnMarkPrice,
  OnOrder,
  OnPosition,
  OnWsMessage,
  OnWsTrade,
} from '../types/index.js'
import { OndoSessionExpiredError } from '../utils/apiClient.js'
import {
  classifyAndMapOrders,
  mapFill,
  mapOpenPositions,
} from '../utils/index.js'
import { intervalFromBarSpan, mapInterval } from '../utils/ohlcvInterval.js'

// Public channels (per market, demuxed from the frame's `market` field):
//   orderbook → depthBooksPerps, trades → tradesPerps, candle → kLinePerps.
// `marketsContext`/`marketContext` merge two wire channels — markPricesPerps
// and fundingRatesPerps — into the aggregated context emit; Ondo publishes no
// mid price on either, so `markPrice` stands in for `midPrice`.
// Authenticated channels (account-wide, no market filter):
//   orderUpdates → ordersPerps, fills → fillsPerps, positions → positionsPerps.
//
// Auth pattern (per the Ondo WS spec): one `{op:'login', args:{token}}` per
// connection, sent before the first private subscribe; the venue rejects a
// second login on the same connection. The JWT comes from the SIWE session in
// the token store — absent or expired reads back as null and surfaces as
// `OndoSessionExpiredError` so callers re-run the SIWE login. A dropped
// socket forgets the login, so the guard resets on every close.

const ONDO_AUTH_CHANNEL = {
  orderUpdates: 'ordersPerps',
  fills: 'fillsPerps',
  positions: 'positionsPerps',
} as const

type AuthChannel = keyof typeof ONDO_AUTH_CHANNEL

const isAuthChannel = (
  channel: Subscription['channel']
): channel is AuthChannel => channel in ONDO_AUTH_CHANNEL

interface SubState {
  /** Subscribe payload minus `op` — re-sent verbatim on every (re)open. */
  frame: { channel: string; markets?: string[]; resolution?: string }
  needsAuth: boolean
  address?: Address
}

/**
 * Options for {@link ondoWsProvider} / {@link OndoWsProvider}.
 *
 * @public
 */
export interface OndoWsProviderOptions {
  /**
   * Ondo REST base URL — namespaces the session-token lookup, so it must
   * match the `apiUrl` the SIWE login stored the token under. Defaults to
   * production.
   */
  apiUrl?: string
  /** Session-token persistence backend. Defaults to browser `localStorage`. */
  storage?: StorageAdapter
}

/**
 * Ondo realtime WS provider (extends {@link WsProviderBase}): subscribes to
 * Ondo's WS channels (orderbook, trades, candles, market context, orders,
 * fills, positions), logging in with the stored SIWE session JWT for the
 * account channels. Construct via {@link ondoWsProvider}.
 *
 * @public
 */
export class OndoWsProvider extends WsProviderBase<SubState> {
  private readonly tokenStore: OndoTokenStore
  private readonly client: PerpsSDKClient | undefined
  private readonly registry: MarketRegistry | undefined

  /** Complete (mark-price-bearing) contexts, keyed by venue market symbol. */
  private contexts: Record<string, MarketContext> = {}
  /** Funding seen before the market's first mark price. */
  private pendingFunding = new Map<
    string,
    { rate: string; nextFundingTime: number }
  >()

  /** The single address this connection's login is bound to. */
  private accountAddress: string | undefined
  private loginPromise: Promise<void> | undefined

  constructor(
    wsUrl: string = DEFAULT_ONDO_WS_URL,
    providerKey = ONDO_PROVIDER_KEY,
    options: OndoWsProviderOptions = {},
    client?: PerpsSDKClient
  ) {
    super(
      new ReconnectingWebSocket(wsUrl, { pingPayload: '{"op":"ping"}' }),
      providerKey
    )
    this.tokenStore = new OndoTokenStore(
      options.storage ?? localStorageAdapter,
      options.apiUrl ?? DEFAULT_ONDO_API_URL
    )
    this.client = client
    this.registry = client && getMarketRegistry(client, providerKey)
    // The venue's login lives and dies with the connection.
    this.rws.on('close', () => {
      this.loginPromise = undefined
    })
  }

  async subscribeQuote(
    params: ProviderGetQuoteParams,
    onQuote: QuoteListener
  ): Promise<() => void> {
    const client = this.client
    if (client === undefined) {
      throw new Error(
        'OndoWsProvider: PerpsSDKClient not provided; cannot stream quotes. ' +
          'Construct via `ondoWsProvider({...})` and register with PerpsWsClient.'
      )
    }
    return resolveSubscribeQuote(
      client,
      this.providerKey,
      this,
      params,
      ONDO_BASE_FEE_TIER,
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
        return `${sub.channel}:${sub.address.toLowerCase()}`
      case 'spotBalances':
        throw new Error(`Ondo WS does not support channel: ${sub.channel}.`)
    }
  }

  protected async openChannel(sub: Subscription): Promise<() => void> {
    const wireSubs = this.resolveChannel(sub)

    if (isAuthChannel(sub.channel)) {
      // One login per connection means one authenticated address.
      const address = (sub as { address: Address }).address.toLowerCase()
      if (
        this.accountAddress !== undefined &&
        this.accountAddress !== address
      ) {
        throw new Error(
          `Ondo WS supports one authenticated address per connection; already bound to ${this.accountAddress}, cannot subscribe for ${address}.`
        )
      }
      this.accountAddress = address
      // Account frames carry venue market symbols; the registry supplies the
      // market identity the mapped orders/fills/positions embed.
      await this.registry?.sync()
    }

    for (const [key, state] of wireSubs) {
      await this.registerSub(key, state)
    }
    await this.rws.ready()

    return () => {
      for (const [key, state] of wireSubs) {
        this.unregisterSub(key)
        this.rws.send(JSON.stringify({ op: 'unsubscribe', ...state.frame }))
      }
    }
  }

  protected async sendSubscribe(state: SubState): Promise<void> {
    if (state.needsAuth && state.address !== undefined) {
      await this.ensureLogin(state.address)
    }
    this.rws.send(JSON.stringify({ op: 'subscribe', ...state.frame }))
  }

  protected override onClose(): void {
    this.contexts = {}
    this.pendingFunding.clear()
    this.loginPromise = undefined
  }

  /** Wire subs for `sub`, keyed uniquely for the base's replay registry. */
  private resolveChannel(sub: Subscription): Array<[string, SubState]> {
    switch (sub.channel) {
      case 'marketsContext':
        return [
          [
            'markPricesPerps',
            { frame: { channel: 'markPricesPerps' }, needsAuth: false },
          ],
          [
            'fundingRatesPerps',
            { frame: { channel: 'fundingRatesPerps' }, needsAuth: false },
          ],
        ]
      case 'marketContext':
        return [
          [
            `markPricesPerps:${sub.marketId}`,
            {
              frame: { channel: 'markPricesPerps', markets: [sub.marketId] },
              needsAuth: false,
            },
          ],
          [
            `fundingRatesPerps:${sub.marketId}`,
            {
              frame: { channel: 'fundingRatesPerps', markets: [sub.marketId] },
              needsAuth: false,
            },
          ],
        ]
      case 'orderbook':
        return [
          [
            `depthBooksPerps:${sub.marketId}`,
            {
              frame: { channel: 'depthBooksPerps', markets: [sub.marketId] },
              needsAuth: false,
            },
          ],
        ]
      case 'trades':
        return [
          [
            `tradesPerps:${sub.marketId}`,
            {
              frame: { channel: 'tradesPerps', markets: [sub.marketId] },
              needsAuth: false,
            },
          ],
        ]
      case 'candle': {
        const resolution = mapInterval(sub.interval)
        return [
          [
            `kLinePerps:${sub.marketId}:${resolution}`,
            {
              frame: {
                channel: 'kLinePerps',
                markets: [sub.marketId],
                resolution,
              },
              needsAuth: false,
            },
          ],
        ]
      }
      case 'orderUpdates':
      case 'fills':
      case 'positions':
        return [
          [
            ONDO_AUTH_CHANNEL[sub.channel],
            {
              frame: { channel: ONDO_AUTH_CHANNEL[sub.channel] },
              needsAuth: true,
              address: sub.address,
            },
          ],
        ]
      case 'spotBalances':
        throw new Error(`Ondo WS does not support channel: ${sub.channel}.`)
    }
  }

  /**
   * Send the login op once per connection, before the first authenticated
   * subscribe. Concurrent callers share one in-flight login; a failure
   * clears the guard so a later subscribe (after a fresh SIWE login) retries.
   */
  private ensureLogin(address: Address): Promise<void> {
    if (this.loginPromise === undefined) {
      this.loginPromise = (async () => {
        const token = await this.tokenStore.get(address)
        if (token === null) {
          throw new OndoSessionExpiredError(
            `No Ondo session for ${address}. Run the SIWE login before subscribing to account channels.`
          )
        }
        this.rws.send(
          JSON.stringify({ op: 'login', args: { token: token.token } })
        )
      })()
      this.loginPromise.catch(() => {
        this.loginPromise = undefined
      })
    }
    return this.loginPromise
  }

  protected handleMessage(raw: string): void {
    let msg: OnWsMessage
    try {
      msg = JSON.parse(raw) as OnWsMessage
    } catch {
      wsLog.parseFailure(this.providerKey, raw)
      return
    }
    if (msg.type === 'error') {
      wsLog.serverError(this.providerKey, msg.msg ?? 'unknown error')
      return
    }
    if (msg.type !== 'update') {
      return
    }
    try {
      switch (msg.channel) {
        case 'depthBooksPerps':
          this.handleBooks(msg.data as OnBookSnapshot[])
          break
        case 'tradesPerps':
          this.handleTrades(msg.data as OnWsTrade[])
          break
        case 'kLinePerps':
          this.handleKline(msg.data as OnKline)
          break
        case 'markPricesPerps':
          this.handleMarkPrices(msg.data as OnMarkPrice[])
          break
        case 'fundingRatesPerps':
          this.handleFundingRates(msg.data as OnFundingRate[])
          break
        case 'ordersPerps':
          this.handleOrders(msg.data as OnOrder[])
          break
        case 'fillsPerps':
          this.handleFills(msg.data as OnFill[])
          break
        case 'positionsPerps':
          this.handlePositions(msg.data as OnPosition[])
          break
      }
    } catch (err) {
      wsLog.handlerFailure(this.providerKey, err)
    }
  }

  private handleBooks(snapshots: OnBookSnapshot[]): void {
    for (const snap of snapshots) {
      const toLevels = (levels: OnBookSnapshot['bids'], direction: 1 | -1) =>
        levels
          .map(([price, size]) => ({ price, size, priceNum: Number(price) }))
          .sort((a, b) => direction * (a.priceNum - b.priceNum))
          .map(({ price, size }) => ({ price, size }))
      this.emit(`orderbook:${snap.market}`, {
        channel: 'orderbook',
        data: {
          provider: this.providerKey,
          marketId: snap.market,
          bids: toLevels(snap.bids, -1),
          asks: toLevels(snap.asks, 1),
          timestamp: Date.parse(snap.time),
        },
      })
    }
  }

  private handleTrades(trades: OnWsTrade[]): void {
    const byMarket = new Map<string, OnWsTrade[]>()
    for (const trade of trades) {
      const batch = byMarket.get(trade.market)
      if (batch === undefined) {
        byMarket.set(trade.market, [trade])
      } else {
        batch.push(trade)
      }
    }
    for (const [market, batch] of byMarket) {
      this.emit(`trades:${market}`, {
        channel: 'trades',
        data: batch.map((trade) => ({
          provider: this.providerKey,
          marketId: trade.market,
          price: trade.price,
          size: trade.size,
          timestamp: Date.parse(trade.time),
          side: trade.aggressor_side,
          id: trade.id,
        })),
      })
    }
  }

  private handleKline(kline: OnKline): void {
    const interval = intervalFromBarSpan(kline.e - kline.s)
    if (interval === undefined) {
      return
    }
    this.emit(`candle:${kline.m}:${interval}`, {
      channel: 'candle',
      data: {
        t: kline.t * 1000,
        o: String(kline.o),
        h: String(kline.h),
        l: String(kline.l),
        c: String(kline.c),
        v: String(kline.v),
      },
    })
  }

  private handleMarkPrices(prices: OnMarkPrice[]): void {
    for (const { market, markPrice } of prices) {
      const context: MarketContext = {
        ...this.contexts[market],
        marketId: market,
        // Ondo streams no mid price; the mark price stands in.
        midPrice: markPrice,
        markPrice,
      }
      const funding = this.pendingFunding.get(market)
      if (funding !== undefined) {
        context.funding = funding
        this.pendingFunding.delete(market)
      }
      this.contexts[market] = context
    }
    this.emitContexts(prices.map((p) => p.market))
  }

  private handleFundingRates(rates: OnFundingRate[]): void {
    const touched: string[] = []
    for (const { market, rate, intervalEnds } of rates) {
      const funding = { rate, nextFundingTime: Date.parse(intervalEnds) }
      const context = this.contexts[market]
      if (context === undefined) {
        // No mark price yet — a context without prices would violate the
        // MarketContext contract, so hold the funding until one arrives.
        this.pendingFunding.set(market, funding)
      } else {
        context.funding = funding
        touched.push(market)
      }
    }
    this.emitContexts(touched)
  }

  private emitContexts(markets: string[]): void {
    this.emit('marketsContext', {
      channel: 'marketsContext',
      data: { ...this.contexts },
    })
    for (const market of markets) {
      const context = this.contexts[market]
      if (context !== undefined) {
        this.emit(`marketContext:${market}`, {
          channel: 'marketContext',
          data: context,
        })
      }
    }
  }

  /** Registry-backed market identity, or `undefined` off the tradable list. */
  private resolveMarket = (market: string): MarketDisplay | undefined => {
    const known = this.registry?.get(market)
    return known && toMarketDisplay(known)
  }

  private handleOrders(orders: OnOrder[]): void {
    const address = this.accountAddress
    if (address === undefined) {
      return
    }
    this.emit(`orderUpdates:${address}`, {
      channel: 'orderUpdates',
      data: classifyAndMapOrders(orders, this.resolveMarket),
    })
  }

  private handleFills(fills: OnFill[]): void {
    const address = this.accountAddress
    if (address === undefined) {
      return
    }
    const mapped = []
    for (const fill of fills) {
      const market = this.resolveMarket(fill.market)
      if (market !== undefined) {
        mapped.push(mapFill(fill, market))
      }
    }
    this.emit(`fills:${address}`, { channel: 'fills', data: mapped })
  }

  private handlePositions(positions: OnPosition[]): void {
    const address = this.accountAddress
    if (address === undefined) {
      return
    }
    const known = positions.filter(
      (position) => this.resolveMarket(position.market) !== undefined
    )
    this.emit(`positions:${address}`, {
      channel: 'positions',
      data: mapOpenPositions(
        known,
        (market) => this.resolveMarket(market) as MarketDisplay
      ),
    })
  }
}

/**
 * Factory for registering the Ondo WS provider with `PerpsWsClient`:
 * `new PerpsWsClient(client, { wsProviders: { ondo: ondoWsProvider() } })`.
 *
 * Closes over the per-instance options (storage, apiUrl override) so
 * `PerpsWsClient` can call the returned factory with just
 * `({ provider, wsUrl, client })` at subscribe time. `markets` is unused —
 * Ondo advertises a single venue, no sub-DEX filtering.
 *
 * @public
 */
export const ondoWsProvider =
  (options?: OndoWsProviderOptions): WsProviderFactory =>
  ({ provider, wsUrl, client }) =>
    new OndoWsProvider(wsUrl, provider, options, client)
