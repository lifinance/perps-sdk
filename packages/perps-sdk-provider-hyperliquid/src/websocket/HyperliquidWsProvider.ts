import {
  cachePromise,
  getMarkets as coreGetMarkets,
  isActiveOrderStatus,
  type PerpsSDKClient,
  ReconnectingWebSocket,
  WsProviderBase,
  type WsProviderFactory,
  wsLog,
} from '@lifi/perps-sdk'
import {
  type Market,
  type MarketDisplay,
  type OpenOrder,
  OrderSide,
  OrderType,
  type Subscription,
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
  findMarket,
  isOpenAssetPosition,
  isTriggerOrder,
  mapFill,
  mapOrderStatus,
  mapOrderType,
  mapPosition,
  priceStepToAggregation,
  spotAssetFromToken,
  spotBalance,
  spotPriceById,
} from '../utils/index.js'

/** HL's `l2Book` returns at most this many levels per side (slow/default mode). */
const HL_L2_BOOK_MAX_LEVELS_PER_SIDE = 20

/** Minimum gap between unknown-market-triggered registry refetches. */
const MARKET_REFRESH_COOLDOWN_MS = 60_000

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
 * `orderUpdates` supports a single address per provider instance: HL delivers
 * those frames without a user field, so frames from two concurrent address
 * subscriptions on one socket cannot be attributed. Subscribing a second
 * address rejects while the first still has listeners; once the first is
 * released, an address switch reclaims the channel immediately.
 *
 * @public
 */
export class HyperliquidWsProvider extends WsProviderBase<object> {
  private orderUpdatesKey: string | undefined
  private readonly subDexes: string[]
  private readonly client: PerpsSDKClient | undefined
  private midsBySubDex = new Map<string, Record<string, string>>()
  private byMarketId = new Map<string, Market>()
  private byMarketIdPromise: Promise<void> | undefined
  private warnedMarketIds = new Set<string>()
  private marketRefreshAfter = 0

  constructor(
    wsUrl: string,
    providerKey: string,
    subDexes: string[],
    client?: PerpsSDKClient
  ) {
    super(
      new ReconnectingWebSocket(wsUrl, { pingPayload: '{"method":"ping"}' }),
      providerKey
    )
    this.subDexes = subDexes
    this.client = client
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
    await this.fetchMarketMap(client)
  }

  private fetchMarketMap(client: PerpsSDKClient): Promise<void> {
    return cachePromise(
      () => this.byMarketIdPromise,
      (p) => {
        this.byMarketIdPromise = p
      },
      async () => {
        const { markets } = await coreGetMarkets(client, {
          provider: this.providerKey,
        })
        this.byMarketId = new Map(markets.map((m) => [m.id, m]))
        this.warnedMarketIds.clear()
      }
    )
  }

  /**
   * Resolve a wire market id against the registry without aborting the
   * containing frame: a miss warns once per id, schedules a cooldown-gated
   * registry refetch (the id may have listed after the snapshot) and returns
   * `undefined` so the caller skips just that item.
   */
  private resolveMarket(marketId: string): MarketDisplay | undefined {
    const market = findMarket(this.byMarketId, marketId)
    if (market) {
      return market
    }
    if (!this.warnedMarketIds.has(marketId)) {
      this.warnedMarketIds.add(marketId)
      wsLog.unknownMarket(this.providerKey, marketId)
    }
    this.refreshMarketMap()
    return undefined
  }

  private refreshMarketMap(): void {
    const client = this.client
    const now = Date.now()
    if (client === undefined || now < this.marketRefreshAfter) {
      return
    }
    // Set synchronously so concurrent frames cannot trigger a refetch storm.
    this.marketRefreshAfter = now + MARKET_REFRESH_COOLDOWN_MS
    this.byMarketIdPromise = undefined
    this.fetchMarketMap(client).catch((error) =>
      wsLog.marketRefreshFailure(this.providerKey, error)
    )
  }

  protected async openChannel(sub: Subscription): Promise<() => void> {
    // Must run synchronously, before any await, so two concurrent opens
    // cannot both pass the exclusivity check.
    if (sub.channel === 'orderUpdates') {
      this.claimOrderUpdatesKey(this.toKey(sub))
    }

    await this.ensureMarketMap()

    // Prices require multi-sub-dex allMids subscriptions under one logical key.
    if (sub.channel === 'prices') {
      const entries = this.getPriceSubEntries()

      for (const { subKey, payload } of entries) {
        await this.registerSub(subKey, payload)
      }

      await this.rws.ready()

      return () => {
        for (const { subKey, payload } of entries) {
          this.unregisterSub(subKey)
          this.rws.send(
            JSON.stringify({ method: 'unsubscribe', subscription: payload })
          )
        }
        this.midsBySubDex.clear()
      }
    }

    // All other channels: single WS subscription per key
    const key = this.toKey(sub)
    const payload = this.toHlPayload(sub)
    await this.registerSub(key, payload)

    await this.rws.ready()

    return () => {
      this.unregisterSub(key)
      if (this.orderUpdatesKey === key) {
        this.orderUpdatesKey = undefined
      }
      this.rws.send(
        JSON.stringify({ method: 'unsubscribe', subscription: payload })
      )
    }
  }

  /**
   * Enforce the single-address `orderUpdates` invariant (HL frames carry no
   * user field, so concurrent address subscriptions are unattributable). A
   * listener-free lingering channel for another address is torn down eagerly
   * so a wallet switch needn't wait out the teardown linger; a live one throws.
   */
  private claimOrderUpdatesKey(key: string): void {
    const active = this.orderUpdatesKey
    if (
      active !== undefined &&
      active !== key &&
      !this.closeChannelIfIdle(active)
    ) {
      throw new Error(
        `Hyperliquid supports one orderUpdates address per provider instance ` +
          `(frames carry no user field). Unsubscribe ` +
          `${active.slice('orderUpdates:'.length)} before subscribing ` +
          `${key.slice('orderUpdates:'.length)}.`
      )
    }
    this.orderUpdatesKey = key
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

  protected onClose(): void {
    this.midsBySubDex.clear()
    this.orderUpdatesKey = undefined
  }

  protected sendSubscribe(payload: object): void {
    this.rws.send(
      JSON.stringify({ method: 'subscribe', subscription: payload })
    )
  }

  protected toKey(sub: Subscription): string {
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
          // HL's l2Book ignores any level-count field; it returns up to 20
          // levels/side and controls granularity via nSigFigs (+ mantissa,
          // valid only when nSigFigs === 5).
          ...(sub.priceStep !== undefined
            ? priceStepToAggregation(
                sub.priceStep,
                Number(this.byMarketId.get(sub.marketId)?.markPrice)
              )
            : {}),
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

  protected handleMessage(raw: string) {
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

    if (msg.channel === 'error') {
      wsLog.serverError(this.providerKey, String(msg.data))
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
        bids: data.levels[0]
          .slice(0, HL_L2_BOOK_MAX_LEVELS_PER_SIDE)
          .map((l) => ({ price: l.px, size: l.sz })),
        asks: data.levels[1]
          .slice(0, HL_L2_BOOK_MAX_LEVELS_PER_SIDE)
          .map((l) => ({ price: l.px, size: l.sz })),
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
    // Untagged frame: attributable only via the single-address invariant.
    const key = this.orderUpdatesKey
    if (key === undefined) {
      return
    }
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
      const market = this.resolveMarket(o.coin)
      if (!market) {
        continue
      }
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
    this.emit(key, {
      channel: 'orderUpdates',
      data: { openOrders, triggerOrders, terminated },
    })
  }

  private handleUserFills(data: HlWsUserFillsData) {
    const items = data.fills.flatMap((f) => {
      const market = this.resolveMarket(f.coin)
      return market ? [mapFill(f as HlUserFill, market)] : []
    })
    this.emit(`userFills:${data.user.toLowerCase()}`, {
      channel: 'fills',
      data: items,
    })
  }

  private handleAllDexsClearinghouseState(
    data: HlWsAllDexsClearinghouseStateData
  ) {
    const positions = data.clearinghouseStates.flatMap(([, state]) =>
      state.assetPositions.flatMap((ap) => {
        if (!isOpenAssetPosition(ap as HlAssetPosition)) {
          return []
        }
        const market = this.resolveMarket(ap.position.coin)
        return market ? [mapPosition(ap as HlAssetPosition, market)] : []
      })
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
