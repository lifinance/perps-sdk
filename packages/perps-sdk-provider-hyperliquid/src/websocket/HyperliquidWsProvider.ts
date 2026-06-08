import {
  cachePromise,
  getMarkets as coreGetMarkets,
  isActiveOrderStatus,
  type PerpsSDKClient,
  ReconnectingWebSocket,
  type SubscriptionListener,
  type WsProvider,
  type WsProviderFactory,
  type WsStatusListener,
  wsLog,
} from '@lifi/perps-sdk'
import {
  type Market,
  type OpenOrder,
  OrderSide,
  OrderType,
  type Subscription,
  type SubscriptionEvent,
  type TriggerOrder,
} from '@lifi/perps-types'
import type {
  HlAssetPosition,
  HlOrderDetail,
  HlUserFill,
  HlWsAllDexsClearinghouseStateData,
  HlWsAllMidsData,
  HlWsCandleData,
  HlWsL2BookData,
  HlWsMessage,
  HlWsSpotStateData,
  HlWsUserFillsData,
} from '../types/index.js'
import {
  isTriggerOrder,
  mapFill,
  mapOrderStatus,
  mapOrderType,
  mapPosition,
  requireMarket,
  spotAssetFromToken,
  spotBalance,
  spotPriceById,
} from '../utils/index.js'

/**
 * `WsProviderFactory` constructor for Hyperliquid — pass to
 * `new PerpsWsClient(client, { wsProviders: { hyperliquid: hyperliquidWsProvider() } })`.
 *
 * Derives the active sub-DEX set from the `markets` list `PerpsWsClient`
 * passes in (the provider's own key and `'spot'` are excluded — they
 * aren't sub-DEX subscriptions on the HL wire). Higher-order shape mirrors
 * `lighterWsProvider(options)` so the two factories register identically.
 *
 * @public
 */
export const hyperliquidWsProvider =
  (): WsProviderFactory =>
  ({ provider, wsUrl, markets, client }) => {
    const subDexes = markets.filter((m) => m !== provider && m !== 'spot')
    return new HyperliquidWsProvider(wsUrl, provider, subDexes, client)
  }

/**
 * Hyperliquid realtime {@link WsProvider}: multiplexes prices, positions,
 * orders, fills and spot balances over a single {@link ReconnectingWebSocket}.
 * Construct via {@link hyperliquidWsProvider}.
 *
 * @public
 */
export class HyperliquidWsProvider implements WsProvider {
  private rws: ReconnectingWebSocket
  private subs = new Map<string, { count: number; payload: object }>()
  private listeners = new Map<string, Set<SubscriptionListener>>()
  private statusListeners = new Set<WsStatusListener>()
  private readonly providerKey: string
  private readonly subDexes: string[]
  private readonly client: PerpsSDKClient | undefined
  private midsBySubDex = new Map<string, Record<string, string>>()
  private byMarketId = new Map<string, Market>()
  private byMarketIdPromise: Promise<void> | undefined

  constructor(
    wsUrl: string,
    providerKey: string,
    subDexes: string[],
    client?: PerpsSDKClient
  ) {
    this.providerKey = providerKey
    this.subDexes = subDexes
    this.client = client
    this.rws = new ReconnectingWebSocket(wsUrl)
    this.rws.on('message', (data) => this.handleMessage(data))
    this.rws.on('open', () => this.resubscribeAll())
    this.rws.onStatus((status) => {
      for (const fn of this.statusListeners) {
        fn(status)
      }
    })
  }

  /**
   * Fetch the backend's enriched `/markets` registry once per provider
   * instance and key it by `Market.id`, used to re-key venue-synthesised
   * displays on mapped positions/orders/fills. No-op without a client.
   */
  private async ensureMarketMap(): Promise<void> {
    const client = this.client
    if (this.byMarketId.size > 0 || client === undefined) {
      return
    }
    await cachePromise(
      () => this.byMarketIdPromise,
      (p) => {
        this.byMarketIdPromise = p
      },
      async () => {
        const { markets } = await coreGetMarkets(client, {
          provider: this.providerKey,
        })
        this.byMarketId = new Map(markets.map((m) => [m.id, m]))
      }
    )
  }

  async subscribe(
    sub: Subscription,
    listener: SubscriptionListener,
    onStatus?: WsStatusListener
  ): Promise<() => void> {
    const unsubscribe = await this.subscribeChannel(sub, listener)
    if (!onStatus) {
      return unsubscribe
    }
    this.statusListeners.add(onStatus)
    onStatus(this.rws.getStatus())
    return () => {
      this.statusListeners.delete(onStatus)
      unsubscribe()
    }
  }

  private async subscribeChannel(
    sub: Subscription,
    listener: SubscriptionListener
  ): Promise<() => void> {
    await this.ensureMarketMap()

    const key = this.toKey(sub)

    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key)!.add(listener)

    // Prices require multi-sub-dex allMids subscriptions
    if (sub.channel === 'prices') {
      const entries = this.getPriceSubEntries()

      for (const { subKey, payload } of entries) {
        const existing = this.subs.get(subKey)
        if (existing) {
          existing.count++
        } else {
          this.subs.set(subKey, { count: 1, payload })
          await this.rws.ready()
          this.rws.send(
            JSON.stringify({ method: 'subscribe', subscription: payload })
          )
        }
      }

      return () => {
        this.listeners.get(key)?.delete(listener)
        let allRemoved = true
        for (const { subKey, payload } of entries) {
          const s = this.subs.get(subKey)
          if (s) {
            s.count--
            if (s.count <= 0) {
              this.subs.delete(subKey)
              this.rws.send(
                JSON.stringify({
                  method: 'unsubscribe',
                  subscription: payload,
                })
              )
            } else {
              allRemoved = false
            }
          }
        }
        if (allRemoved) {
          this.listeners.delete(key)
          this.midsBySubDex.clear()
        }
      }
    }

    // All other channels: single WS subscription per key
    const payload = this.toHlPayload(sub)
    const existing = this.subs.get(key)
    if (existing) {
      existing.count++
    } else {
      this.subs.set(key, { count: 1, payload })
      await this.rws.ready()
      this.rws.send(
        JSON.stringify({ method: 'subscribe', subscription: payload })
      )
    }

    return () => {
      this.listeners.get(key)?.delete(listener)
      const s = this.subs.get(key)
      if (s) {
        s.count--
        if (s.count <= 0) {
          this.subs.delete(key)
          this.listeners.delete(key)
          this.rws.send(
            JSON.stringify({ method: 'unsubscribe', subscription: payload })
          )
        }
      }
    }
  }

  /** Build sub-key + payload pairs for each sub-dex allMids subscription. */
  private getPriceSubEntries(): Array<{ subKey: string; payload: object }> {
    return [
      {
        subKey: 'allMids:default',
        payload: { type: 'allMids' },
      },
      ...this.subDexes.map((dex) => ({
        subKey: `allMids:${dex}`,
        payload: { type: 'allMids', dex },
      })),
    ]
  }

  close() {
    this.rws.close()
    this.subs.clear()
    this.listeners.clear()
    this.statusListeners.clear()
  }

  private resubscribeAll() {
    for (const { payload } of this.subs.values()) {
      this.rws.send(
        JSON.stringify({ method: 'subscribe', subscription: payload })
      )
    }
  }

  private toKey(sub: Subscription): string {
    switch (sub.channel) {
      case 'prices':
        return 'allMids'
      case 'orderbook':
        return `l2Book:${sub.marketId}`
      case 'candle':
        return `candle:${sub.marketId}:${sub.interval}`
      case 'orderUpdates':
        return `orderUpdates:${sub.address.toLowerCase()}`
      case 'fills':
        return `userFills:${sub.address.toLowerCase()}`
      case 'positions':
        return `positions:${sub.address.toLowerCase()}`
      case 'spotBalances':
        return `spotState:${sub.address.toLowerCase()}`
    }
  }

  private toHlPayload(sub: Subscription): object {
    switch (sub.channel) {
      case 'prices':
        // Prices are handled via getPriceSubEntries in subscribe()
        // and never reach toHlPayload, but TS requires exhaustive cases.
        return { type: 'allMids' }
      case 'orderbook':
        return {
          type: 'l2Book',
          coin: sub.marketId,
          ...(sub.depth !== undefined ? { nLevels: sub.depth } : {}),
        }
      case 'candle':
        return {
          type: 'candle',
          coin: sub.marketId,
          interval: sub.interval,
        }
      case 'orderUpdates':
        return { type: 'orderUpdates', user: sub.address }
      case 'fills':
        return { type: 'userFills', user: sub.address }
      case 'positions':
        return { type: 'allDexsClearinghouseState', user: sub.address }
      case 'spotBalances':
        return { type: 'spotState', user: sub.address }
    }
  }

  private emit(key: string, event: SubscriptionEvent) {
    const fns = this.listeners.get(key)
    if (fns) {
      for (const fn of fns) {
        fn(event)
      }
    }
  }

  private emitToPrefix(prefix: string, event: SubscriptionEvent) {
    for (const [key, fns] of this.listeners) {
      if (key.startsWith(prefix)) {
        for (const fn of fns) {
          fn(event)
        }
      }
    }
  }

  private handleMessage(raw: string) {
    let msg: HlWsMessage
    try {
      msg = JSON.parse(raw)
    } catch {
      wsLog.parseFailure(this.providerKey, raw)
      return
    }
    if (
      !msg.channel ||
      msg.channel === 'pong' ||
      msg.channel === 'subscriptionResponse'
    ) {
      return
    }

    if (!isValidHlFrame(msg.channel, msg.data)) {
      wsLog.parseFailure(this.providerKey, raw)
      return
    }

    try {
      switch (msg.channel) {
        case 'allMids':
          this.handleAllMids(msg.data as HlWsAllMidsData)
          break
        case 'l2Book':
          this.handleL2Book(msg.data as HlWsL2BookData)
          break
        case 'candle':
          this.handleCandle(msg.data as HlWsCandleData)
          break
        case 'orderUpdates':
          this.handleOrderUpdates(msg.data as HlOrderDetail[])
          break
        case 'userFills':
          this.handleUserFills(msg.data as HlWsUserFillsData)
          break
        case 'allDexsClearinghouseState':
          this.handleAllDexsClearinghouseState(
            msg.data as HlWsAllDexsClearinghouseStateData
          )
          break
        case 'spotState':
          this.handleSpotState(msg.data as HlWsSpotStateData)
          break
      }
    } catch (error) {
      wsLog.handlerFailure(this.providerKey, error)
    }
  }

  private handleAllMids(data: HlWsAllMidsData) {
    const subDexKey = data.dex || 'default'
    this.midsBySubDex.set(subDexKey, data.mids)

    const merged: Record<string, string> = {}
    for (const mids of this.midsBySubDex.values()) {
      Object.assign(merged, mids)
    }

    this.emit('allMids', { channel: 'prices', data: merged })
  }

  private handleL2Book(data: HlWsL2BookData) {
    this.emit(`l2Book:${data.coin}`, {
      channel: 'orderbook',
      data: {
        provider: this.providerKey,
        marketId: data.coin,
        bids: data.levels[0].map((l) => ({ price: l.px, size: l.sz })),
        asks: data.levels[1].map((l) => ({ price: l.px, size: l.sz })),
        timestamp: data.time,
      },
    })
  }

  private handleCandle(data: HlWsCandleData) {
    this.emit(`candle:${data.s}:${data.i}`, {
      channel: 'candle',
      data: {
        t: data.t,
        o: data.o,
        h: data.h,
        l: data.l,
        c: data.c,
        v: data.v,
      },
    })
  }

  private handleOrderUpdates(data: HlOrderDetail[]) {
    const openOrders: OpenOrder[] = []
    const triggerOrders: TriggerOrder[] = []
    const terminated: string[] = []
    for (const detail of data) {
      const o = detail.order
      const orderId = String(o.oid)
      if (!isActiveOrderStatus(mapOrderStatus(detail.status))) {
        terminated.push(orderId)
        continue
      }
      const type = mapOrderType(o.orderType)
      const market = requireMarket(this.byMarketId, o.coin)
      const createdAt = new Date(o.timestamp).toISOString()
      if (isTriggerOrder(o)) {
        const isLimit =
          type === OrderType.TAKE_PROFIT_LIMIT || type === OrderType.STOP_LIMIT
        triggerOrders.push({
          orderId,
          market,
          type,
          size: o.sz,
          triggerPrice: o.triggerPx ?? '0',
          ...(isLimit ? { limitPrice: o.limitPx } : {}),
          label: o.triggerCondition,
          createdAt,
        })
      } else {
        const filled = parseFloat(o.origSz) - parseFloat(o.sz)
        openOrders.push({
          orderId,
          market,
          side: o.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
          type,
          size: o.sz,
          price: o.limitPx,
          filledSize: filled.toString(),
          reduceOnly: o.reduceOnly ?? false,
          createdAt,
        })
      }
    }
    this.emitToPrefix('orderUpdates:', {
      channel: 'orderUpdates',
      data: { openOrders, triggerOrders, terminated },
    })
  }

  private handleUserFills(data: HlWsUserFillsData) {
    const items = data.fills.map((f) =>
      mapFill(f as HlUserFill, requireMarket(this.byMarketId, f.coin))
    )
    this.emit(`userFills:${data.user}`, { channel: 'fills', data: items })
  }

  private handleAllDexsClearinghouseState(
    data: HlWsAllDexsClearinghouseStateData
  ) {
    const positions = data.clearinghouseStates.flatMap(([, state]) =>
      state.assetPositions.map((ap) =>
        mapPosition(
          ap as HlAssetPosition,
          requireMarket(this.byMarketId, ap.position.coin)
        )
      )
    )
    this.emit(`positions:${data.user.toLowerCase()}`, {
      channel: 'positions',
      data: positions,
    })
  }

  private handleSpotState(data: HlWsSpotStateData) {
    const priceById = spotPriceById([...this.byMarketId.values()])
    this.emit(`spotState:${data.user.toLowerCase()}`, {
      channel: 'spotBalances',
      data: data.spotState.balances.map((b) => ({
        ...spotBalance(spotAssetFromToken(b), b.total, priceById),
        locked: b.hold,
      })),
    })
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/**
 * Minimal presence/type check of the channel-discriminating and required
 * fields the matching handler dereferences without its own guard. A frame
 * that parses but fails this is a bad frame (log + skip), distinct from a
 * handler that throws on otherwise-shaped data. Unknown channels pass through
 * to the dispatch switch, which silently ignores them.
 */
function isValidHlFrame(channel: string, data: unknown): boolean {
  if (!isObject(data)) {
    return false
  }
  switch (channel) {
    case 'allMids':
      return isObject(data.mids)
    case 'l2Book':
      return (
        typeof data.coin === 'string' &&
        Array.isArray(data.levels) &&
        Array.isArray(data.levels[0]) &&
        Array.isArray(data.levels[1]) &&
        typeof data.time === 'number'
      )
    case 'candle':
      return typeof data.s === 'string' && typeof data.i === 'string'
    case 'orderUpdates':
      return Array.isArray(data)
    case 'userFills':
      return typeof data.user === 'string' && Array.isArray(data.fills)
    case 'allDexsClearinghouseState':
      return (
        typeof data.user === 'string' && Array.isArray(data.clearinghouseStates)
      )
    case 'spotState':
      return (
        typeof data.user === 'string' &&
        isObject(data.spotState) &&
        Array.isArray(data.spotState.balances)
      )
    default:
      return true
  }
}
