import {
  getMarketRegistry,
  isActiveOrderStatus,
  type MarketRegistry,
  type PerpsSDKClient,
  type ProviderGetQuoteParams,
  type QuoteListener,
  ReconnectingWebSocket,
  resolveSubscribeQuote,
  WsProviderBase,
  type WsProviderFactory,
  wsLog,
} from '@lifi/perps-sdk'
import {
  type MarketContext,
  type OpenOrder,
  OrderSide,
  OrderType,
  type Subscription,
  type TriggerOrder,
} from '@lifi/perps-types'
import { HYPERLIQUID_FEE_TIER_FALLBACK, SPOT_MARKET_ID } from '../constants.js'
import type {
  HlAssetPosition,
  HlOrderDetail,
  HlUserFill,
  HlWsAllDexsAssetCtxsData,
  HlWsAllDexsClearinghouseStateData,
  HlWsAllMidsData,
  HlWsCandleData,
  HlWsL2BookData,
  HlWsMessage,
  HlWsPerpAssetCtx,
  HlWsSpotStateData,
  HlWsUserFillsData,
} from '../types/index.js'
import {
  isOpenAssetPosition,
  isTriggerOrder,
  mapFill,
  mapMarketContext,
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

/**
 * `WsProviderFactory` constructor for Hyperliquid — pass to
 * `new PerpsWsClient(client, { wsProviders: { hyperliquid: hyperliquidWsProvider() } })`.
 *
 * Higher-order shape mirrors `lighterWsProvider(options)` so the two factories
 * register identically.
 *
 * @public
 */
export const hyperliquidWsProvider =
  (): WsProviderFactory =>
  ({ provider, wsUrl, client }) =>
    new HyperliquidWsProvider(wsUrl, provider, client)

/**
 * Hyperliquid realtime {@link WsProvider}: multiplexes markets context,
 * positions, orders, fills and spot balances over a single
 * {@link ReconnectingWebSocket}.
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
  private readonly client: PerpsSDKClient | undefined
  private readonly registry: MarketRegistry | undefined
  private perpCtxBySubDex = new Map<string, Record<string, HlWsPerpAssetCtx>>()
  private spotMids: Record<string, string> = {}

  constructor(wsUrl: string, providerKey: string, client?: PerpsSDKClient) {
    super(
      new ReconnectingWebSocket(wsUrl, { pingPayload: '{"method":"ping"}' }),
      providerKey
    )
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
        'HyperliquidWsProvider: PerpsSDKClient not provided; cannot stream quotes. ' +
          'Construct via `hyperliquidWsProvider()` and register with PerpsWsClient.'
      )
    }
    return resolveSubscribeQuote(
      client,
      this.providerKey,
      this,
      params,
      HYPERLIQUID_FEE_TIER_FALLBACK,
      onQuote
    )
  }

  protected async openChannel(sub: Subscription): Promise<() => void> {
    // Must run synchronously, before any await, so two concurrent opens
    // cannot both pass the exclusivity check.
    if (sub.channel === 'orderUpdates') {
      this.claimOrderUpdatesKey(this.toKey(sub))
    }

    await this.registry?.sync()

    // Markets context aggregates the all-dexs perp asset-context feed (mid,
    // mark, oracle, funding, OI) with the default `allMids` frame, whose spot
    // mids HL publishes nowhere else.
    if (sub.channel === 'marketsContext') {
      const entries = this.getMarketsContextSubEntries()

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
        this.perpCtxBySubDex.clear()
        this.spotMids = {}
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

  /**
   * Sub-key + payload pairs for the markets-context aggregation: the all-dexs
   * perp asset-context feed plus the default `allMids` frame (the only feed
   * carrying spot mids).
   */
  private getMarketsContextSubEntries(): Array<{
    subKey: string
    payload: object
  }> {
    return [
      { subKey: 'allDexsAssetCtxs', payload: { type: 'allDexsAssetCtxs' } },
      { subKey: 'allMids:default', payload: { type: 'allMids' } },
    ]
  }

  protected override onClose(): void {
    this.perpCtxBySubDex.clear()
    this.spotMids = {}
    this.orderUpdatesKey = undefined
  }

  protected sendSubscribe(payload: object): void {
    this.rws.send(
      JSON.stringify({ method: 'subscribe', subscription: payload })
    )
  }

  protected toKey(sub: Subscription): string {
    switch (sub.channel) {
      case 'marketsContext':
        return 'marketsContext'
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
      case 'marketsContext':
        // Handled via getMarketsContextSubEntries in openChannel; never reaches
        // toHlPayload, but TS requires an exhaustive switch.
        return { type: 'allDexsAssetCtxs' }
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
                this.mergedMids().get(sub.marketId) ?? Number.NaN
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
        case 'allDexsAssetCtxs':
          this.handleAllDexsAssetCtxs(msg.data as HlWsAllDexsAssetCtxsData)
          break
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

  private handleAllDexsAssetCtxs(data: HlWsAllDexsAssetCtxsData) {
    for (const [dex, ctxs] of data.assetCtxs) {
      const byMarketId: Record<string, HlWsPerpAssetCtx> = {}
      for (const ctx of ctxs) {
        byMarketId[ctx.coin] = ctx
      }
      this.perpCtxBySubDex.set(dex || 'default', byMarketId)
    }
    this.emitMarketsContext()
  }

  private handleAllMids(data: HlWsAllMidsData) {
    this.spotMids = { ...this.spotMids, ...data.mids }
    this.emitMarketsContext()
  }

  /**
   * Build the all-markets context map: every perp asset context across sub-dexs,
   * plus a mid-only entry for each registry spot market priced by `allMids` (HL
   * publishes no aggregate spot mark/oracle over WS).
   */
  private emitMarketsContext() {
    const data: Record<string, MarketContext> = {}
    for (const byMarketId of this.perpCtxBySubDex.values()) {
      for (const [marketId, ctx] of Object.entries(byMarketId)) {
        data[marketId] = mapMarketContext(marketId, ctx)
      }
    }
    for (const market of this.registry?.markets ?? []) {
      if (market.categoryId !== SPOT_MARKET_ID) {
        continue
      }
      const mid = this.spotMids[market.id]
      if (mid !== undefined) {
        // Spot mid stands in for the required mark; HL streams no spot mark.
        data[market.id] = { marketId: market.id, midPrice: mid, markPrice: mid }
      }
    }
    this.emit('marketsContext', { channel: 'marketsContext', data })
  }

  /** Latest mid per `Market.id` across the perp ctx feed and the spot mids. */
  private mergedMids(): Map<string, number> {
    const map = new Map<string, number>()
    for (const byMarketId of this.perpCtxBySubDex.values()) {
      for (const [id, ctx] of Object.entries(byMarketId)) {
        const mid = ctx.midPx ?? ctx.markPx
        map.set(id, Number(mid))
      }
    }
    for (const [id, mid] of Object.entries(this.spotMids)) {
      map.set(id, Number(mid))
    }
    return map
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
      // A miss warns once and schedules a cooldown-gated registry refetch
      // (the id may have listed after the snapshot); skip just this item.
      const market = this.registry?.get(o.coin)
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
      const market = this.registry?.get(f.coin)
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
        const market = this.registry?.get(ap.position.coin)
        return market ? [mapPosition(ap as HlAssetPosition, market)] : []
      })
    )
    this.emit(`positions:${data.user.toLowerCase()}`, {
      channel: 'positions',
      data: positions,
    })
  }

  private handleSpotState(data: HlWsSpotStateData) {
    const priceById = spotPriceById(
      this.registry?.markets ?? [],
      this.mergedMids()
    )
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
    case 'allDexsAssetCtxs':
      return Array.isArray(data.assetCtxs)
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
