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
  toPerpsMarketDisplay,
  WsProviderBase,
  type WsProviderFactory,
  wsLog,
} from '@lifi/perps-sdk'
import type {
  MarketContext,
  MarketDisplay,
  PerpsMarketDisplay,
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
  OndoBalanceSummary,
  OndoBookSnapshot,
  OndoFill,
  OndoFundingRate,
  OndoKline,
  OndoMarkPrice,
  OndoOrder,
  OndoPosition,
  OndoWsMessage,
  OndoWsTrade,
} from '../types/index.js'
import { OndoSessionExpiredError } from '../utils/apiClient.js'
import {
  classifyAndMapOrders,
  mapFill,
  mapPosition,
  OndoApiClient,
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

// Fan-out channels that reserve the connection's single authenticated-address
// binding; `accountSummary` rides the auth wires without being one itself.
const ONDO_AUTH_FANOUT: readonly string[] = [
  ...Object.keys(ONDO_AUTH_CHANNEL),
  'accountSummary',
]

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
  private readonly apiUrl: string

  /**
   * Ref count per shared authenticated wire channel (`positionsPerps`,
   * `fillsPerps`, `ordersPerps`): `positions`/`fills` and the derived
   * `accountSummary` ride the same wire subs, so neither's teardown may
   * unsubscribe one the other still holds.
   */
  private readonly authWireRefs = new Map<string, number>()

  /**
   * Running account-summary inputs while `accountSummary` is subscribed
   * (`undefined` otherwise). `walletBalance` is REST-seeded and refreshed on
   * fills; `marginUsed`/`unrealizedPnl` track the latest positions frame.
   */
  private accountSummary:
    | { walletBalance: number; marginUsed: number; unrealizedPnl: number }
    | undefined

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
    this.apiUrl = options.apiUrl ?? DEFAULT_ONDO_API_URL
    this.tokenStore = new OndoTokenStore(
      options.storage ?? localStorageAdapter,
      this.apiUrl
    )
    this.client = client
    this.registry = client && getMarketRegistry(client, providerKey)
    // The venue's login lives and dies with the connection, so a drop must
    // forget both the in-flight login and the address it bound.
    this.rws.on('close', () => {
      this.loginPromise = undefined
      this.accountAddress = undefined
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
      case 'accountSummary':
      case 'spotBalances':
        return `${sub.channel}:${sub.address.toLowerCase()}`
    }
  }

  protected async openChannel(sub: Subscription): Promise<() => void> {
    // Ondo streams no balance channel: `spotBalances` is always empty, so
    // emit one empty snapshot and hold the wire untouched.
    if (sub.channel === 'spotBalances') {
      this.emit(this.toKey(sub), { channel: 'spotBalances', data: [] })
      return () => {}
    }

    const wireSubs = this.resolveChannel(sub)
    const needsLogin =
      isAuthChannel(sub.channel) || sub.channel === 'accountSummary'

    let boundHere = false
    if (needsLogin) {
      const address = (sub as { address: Address }).address.toLowerCase()
      boundHere = this.accountAddress !== address
      this.bindAddress(address)
    }

    try {
      if (needsLogin) {
        // Account frames carry venue market symbols; the registry supplies the
        // market identity the mapped orders/fills/positions embed.
        await this.registry?.sync()
      }
      if (sub.channel === 'accountSummary') {
        await this.seedAccountSummary((sub as { address: Address }).address)
      }
      // Authenticated wire subs are shared and ref-counted; public ones are 1:1.
      for (const [key, state] of wireSubs) {
        await this.acquireWire(key, state, needsLogin)
      }
      await this.rws.ready()
    } catch (err) {
      // Login/seed failed before the binding took hold on the wire: release a
      // binding this call newly reserved so a later subscribe can rebind.
      if (boundHere) {
        this.accountAddress = undefined
      }
      throw err
    }

    return () => {
      if (sub.channel === 'accountSummary') {
        this.accountSummary = undefined
      }
      for (const [key, state] of wireSubs) {
        this.releaseWire(key, state, needsLogin)
      }
    }
  }

  /**
   * Reserve the connection's single authenticated slot for `address`. A prior
   * binding whose channels have all been released — still lingering in the
   * base teardown window — is reclaimed (cycling the connection) before the
   * new one takes it; a binding that another address still holds live throws.
   */
  private bindAddress(address: string): void {
    if (this.accountAddress === address) {
      return
    }
    if (this.accountAddress !== undefined && !this.releaseBindingIfIdle()) {
      throw new Error(
        `Ondo WS supports one authenticated address per connection; already bound to ${this.accountAddress}, cannot subscribe for ${address}.`
      )
    }
    this.accountAddress = address
  }

  /**
   * Force-tear-down the bound address's authenticated channels when every one
   * is idle, which cycles the connection via {@link releaseBinding}. Returns
   * false — leaving the binding intact — while any is still live.
   */
  private releaseBindingIfIdle(): boolean {
    const bound = this.accountAddress
    if (bound === undefined) {
      return true
    }
    for (const channel of ONDO_AUTH_FANOUT) {
      if (!this.closeChannelIfIdle(`${channel}:${bound}`)) {
        return false
      }
    }
    return true
  }

  /**
   * Forget the authenticated binding and cycle the connection. The venue
   * permits one login per socket, so a later subscribe for a different address
   * must authenticate on a fresh connection rather than re-login on this one.
   */
  private releaseBinding(): void {
    this.accountAddress = undefined
    this.loginPromise = undefined
    this.rws.reconnect()
  }

  /** Register a wire sub, ref-counting the shared authenticated channels. */
  private async acquireWire(
    key: string,
    state: SubState,
    shared: boolean
  ): Promise<void> {
    if (!shared) {
      await this.registerSub(key, state)
      return
    }
    const count = this.authWireRefs.get(key) ?? 0
    this.authWireRefs.set(key, count + 1)
    if (count === 0) {
      try {
        await this.registerSub(key, state)
      } catch (err) {
        // Roll back the ref we just took so a later subscribe re-registers.
        this.authWireRefs.delete(key)
        throw err
      }
    }
  }

  /** Mirror of {@link acquireWire}: drop the wire sub on its last release. */
  private releaseWire(key: string, state: SubState, shared: boolean): void {
    if (shared) {
      const remaining = (this.authWireRefs.get(key) ?? 1) - 1
      if (remaining > 0) {
        this.authWireRefs.set(key, remaining)
        return
      }
      this.authWireRefs.delete(key)
    }
    this.unregisterSub(key)
    this.rws.send(JSON.stringify({ op: 'unsubscribe', ...state.frame }))
    // Last authenticated wire gone: forget the binding and cycle the socket so
    // the next address logs in on a fresh connection.
    if (shared && this.authWireRefs.size === 0) {
      this.releaseBinding()
    }
  }

  protected async sendSubscribe(state: SubState): Promise<void> {
    if (state.needsAuth && state.address !== undefined) {
      // Re-assert the binding: a replay after a reconnect (which cleared it on
      // close) must restore the address account frames emit under.
      this.accountAddress = state.address.toLowerCase()
      await this.ensureLogin(state.address)
    }
    this.rws.send(JSON.stringify({ op: 'subscribe', ...state.frame }))
  }

  protected override onClose(): void {
    this.contexts = {}
    this.pendingFunding.clear()
    this.loginPromise = undefined
    this.accountAddress = undefined
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
      case 'accountSummary':
        // Not a wire channel: derived from the positions feed (margin/uPnL)
        // and the REST wallet balance, refreshed on fills.
        return [
          [
            'positionsPerps',
            {
              frame: { channel: 'positionsPerps' },
              needsAuth: true,
              address: sub.address,
            },
          ],
          [
            'fillsPerps',
            {
              frame: { channel: 'fillsPerps' },
              needsAuth: true,
              address: sub.address,
            },
          ],
        ]
      case 'spotBalances':
        return []
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

  private restClient(): OndoApiClient {
    return new OndoApiClient(this.apiUrl, {
      fetchImpl: this.client?.config.fetch,
    })
  }

  /**
   * Seed the account-summary inputs from the REST balance so the first emit is
   * complete before any positions frame lands. Throws {@link
   * OndoSessionExpiredError} when the SIWE session is missing, matching the
   * other authenticated channels.
   */
  private async seedAccountSummary(address: Address): Promise<void> {
    const token = await this.tokenStore.get(address)
    if (token === null) {
      throw new OndoSessionExpiredError(
        `No Ondo session for ${address}. Run the SIWE login before subscribing to account channels.`
      )
    }
    const balance = await this.restClient().get<OndoBalanceSummary>(
      '/v1/perps/balance',
      { authToken: token.token }
    )
    this.accountSummary = {
      walletBalance: Number.parseFloat(balance.walletBalance) || 0,
      marginUsed: Number.parseFloat(balance.usedMargin) || 0,
      unrealizedPnl: Number.parseFloat(balance.unrealizedPnl) || 0,
    }
    this.emitAccountSummary()
  }

  /** Re-pull the wallet balance (moved by the fill) and re-emit the summary. */
  private async refreshAccountSummaryBalance(address: Address): Promise<void> {
    const token = await this.tokenStore.get(address)
    if (token === null || this.accountSummary === undefined) {
      return
    }
    const balance = await this.restClient().get<OndoBalanceSummary>(
      '/v1/perps/balance',
      { authToken: token.token }
    )
    if (this.accountSummary === undefined) {
      return
    }
    this.accountSummary.walletBalance =
      Number.parseFloat(balance.walletBalance) || 0
    this.emitAccountSummary()
  }

  /**
   * Emit the current account summary. Gross semantics: `walletBalance` is the
   * collateral, the positions carry unrealized PnL, so it counts toward buying
   * power (`availableMargin = walletBalance + unrealizedPnl − marginUsed`).
   */
  private emitAccountSummary(): void {
    const summary = this.accountSummary
    const address = this.accountAddress
    if (summary === undefined || address === undefined) {
      return
    }
    const portfolioValue = summary.walletBalance + summary.unrealizedPnl
    this.emit(`accountSummary:${address}`, {
      channel: 'accountSummary',
      data: {
        portfolioValue: portfolioValue.toString(),
        availableMargin: (portfolioValue - summary.marginUsed).toString(),
        marginUsed: summary.marginUsed.toString(),
        unrealizedPnl: summary.unrealizedPnl.toString(),
      },
    })
  }

  protected handleMessage(raw: string): void {
    let msg: OndoWsMessage
    try {
      msg = JSON.parse(raw) as OndoWsMessage
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
          this.handleBooks(msg.data as OndoBookSnapshot[])
          break
        case 'tradesPerps':
          this.handleTrades(msg.data as OndoWsTrade[])
          break
        case 'kLinePerps':
          this.handleKline(msg.data as OndoKline)
          break
        case 'markPricesPerps':
          this.handleMarkPrices(msg.data as OndoMarkPrice[])
          break
        case 'fundingRatesPerps':
          this.handleFundingRates(msg.data as OndoFundingRate[])
          break
        case 'ordersPerps':
          this.handleOrders(msg.data as OndoOrder[])
          break
        case 'fillsPerps':
          this.handleFills(msg.data as OndoFill[])
          break
        case 'positionsPerps':
          this.handlePositions(msg.data as OndoPosition[])
          break
      }
    } catch (err) {
      wsLog.handlerFailure(this.providerKey, err)
    }
  }

  private handleBooks(snapshots: OndoBookSnapshot[]): void {
    for (const snap of snapshots) {
      const toLevels = (levels: OndoBookSnapshot['bids'], direction: 1 | -1) =>
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

  private handleTrades(trades: OndoWsTrade[]): void {
    const byMarket = new Map<string, OndoWsTrade[]>()
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

  private handleKline(kline: OndoKline): void {
    const interval = intervalFromBarSpan(kline.e - kline.s)
    if (interval === undefined) {
      return
    }
    this.emit(`candle:${kline.m}:${interval}`, {
      channel: 'candle',
      data: {
        t: kline.s * 1000,
        o: String(kline.o),
        h: String(kline.h),
        l: String(kline.l),
        c: String(kline.c),
        v: String(kline.v),
      },
    })
  }

  private handleMarkPrices(prices: OndoMarkPrice[]): void {
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

  private handleFundingRates(rates: OndoFundingRate[]): void {
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

  private resolvePerpsMarket = (
    market: string
  ): PerpsMarketDisplay | undefined => {
    const known = this.registry?.get(market)
    return known && toPerpsMarketDisplay(known)
  }

  private handleOrders(orders: OndoOrder[]): void {
    const address = this.accountAddress
    if (address === undefined) {
      return
    }
    this.emit(`orderUpdates:${address}`, {
      channel: 'orderUpdates',
      data: classifyAndMapOrders(orders, this.resolveMarket),
    })
  }

  private handleFills(fills: OndoFill[]): void {
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
    if (this.accountSummary !== undefined) {
      this.refreshAccountSummaryBalance(address as Address).catch((err) =>
        wsLog.handlerFailure(this.providerKey, err)
      )
    }
  }

  private handlePositions(positions: OndoPosition[]): void {
    const address = this.accountAddress
    if (address === undefined) {
      return
    }
    const mapped = positions.flatMap((position) => {
      if (
        position.direction === 'neutral' ||
        Number.parseFloat(position.netQuantity) === 0
      ) {
        return []
      }
      const market = this.resolvePerpsMarket(position.market)
      return market === undefined ? [] : [mapPosition(position, market)]
    })
    this.emit(`positions:${address}`, {
      channel: 'positions',
      data: mapped,
    })
    if (this.accountSummary !== undefined) {
      let marginUsed = 0
      let unrealizedPnl = 0
      for (const position of positions) {
        marginUsed += Number.parseFloat(position.usedMargin) || 0
        unrealizedPnl += Number.parseFloat(position.unrealizedPnl) || 0
      }
      this.accountSummary.marginUsed = marginUsed
      this.accountSummary.unrealizedPnl = unrealizedPnl
      this.emitAccountSummary()
    }
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
