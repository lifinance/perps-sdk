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
  type OrderbookLevel,
  type OrderbookResponse,
  OrderSide,
  OrderType,
  type Subscription,
  type TriggerOrder,
} from '@lifi/perps-types'
import Big from 'big.js'
import { HYPERLIQUID_FEE_TIER_FALLBACK, SPOT_MARKET_ID } from '../constants.js'
import type {
  HlAssetPosition,
  HlOrderDetail,
  HlUserFill,
  HlWsActiveAssetCtxData,
  HlWsActiveSpotAssetCtxData,
  HlWsAllDexsAssetCtxsData,
  HlWsAllDexsClearinghouseStateData,
  HlWsCandleData,
  HlWsCompressedL2Data,
  HlWsFastAssetCtx,
  HlWsL2BookData,
  HlWsL2Data,
  HlWsMessage,
  HlWsPacData,
  HlWsPerpAssetCtx,
  HlWsPerpAssetCtxPayload,
  HlWsSacData,
  HlWsSpotAssetCtx,
  HlWsSpotStateData,
  HlWsTrade,
  HlWsUserFillsData,
} from '../types/index.js'
import {
  decodeCompressedJson,
  decodeFastAssetCtxs,
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

/** HL's compact `l2` snapshot carries 20 levels per side. */
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
  private spotCtxByMarketId: Record<string, HlWsSpotAssetCtx> = {}
  private marketsContextByMarketId: Record<string, MarketContext> = {}
  private orderbookKeysByMarketId = new Map<string, Set<string>>()
  private latestOrderbookByMarketId = new Map<string, OrderbookResponse>()
  // Latest mid/mark per `Market.id` from the high-frequency `fastAssetCtxs`
  // feed (all dexes, incl. builder/sub-dex coins). Merged incrementally —
  // frames carry only changed coins — and overlaid onto asset contexts that
  // carry oracle/funding/OI/metadata.
  private fastCtxByMarketId: Record<string, HlWsFastAssetCtx> = {}
  // `fastAssetCtxs` payloads are base64 + raw-DEFLATE; decode is async, so
  // chain decodes to apply incremental frames in arrival order.
  private fastDecodeChain: Promise<void> = Promise.resolve()
  private pacDecodeChain: Promise<void> = Promise.resolve()
  private sacDecodeChain: Promise<void> = Promise.resolve()
  private orderbookDecodeChain: Promise<void> = Promise.resolve()

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

    // Markets context aggregates slower asset-context feeds with fast mid/mark
    // ticks from `fastAssetCtxs`.
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
        this.spotCtxByMarketId = {}
        this.fastCtxByMarketId = {}
        this.marketsContextByMarketId = {}
      }
    }

    // All other channels: single WS subscription per key
    const key = this.toKey(sub)
    if (sub.channel === 'orderbook') {
      this.claimOrderbookKey(sub.marketId, key)
    }
    const payload = this.toHlPayload(sub)
    await this.registerSub(key, payload)
    if (sub.channel === 'orderbook') {
      this.registerOrderbook(sub.marketId, key)
    }

    await this.rws.ready()

    return () => {
      this.unregisterSub(key)
      if (this.orderUpdatesKey === key) {
        this.orderUpdatesKey = undefined
      }
      this.rws.send(
        JSON.stringify({
          method: 'unsubscribe',
          subscription: payload,
        })
      )
      if (sub.channel === 'orderbook') {
        this.releaseOrderbook(sub.marketId, key)
      }
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

  private claimOrderbookKey(marketId: string, key: string): void {
    const activeKeys = this.orderbookKeysByMarketId.get(marketId)
    if (activeKeys === undefined) {
      return
    }

    for (const activeKey of [...activeKeys]) {
      if (activeKey === key) {
        continue
      }
      if (!this.closeChannelIfIdle(activeKey)) {
        throw new Error(
          `Hyperliquid supports one orderbook aggregation per market per ` +
            `provider instance. Unsubscribe ${activeKey} before subscribing ${key}.`
        )
      }
    }
  }

  /**
   * Sub-key + payload pairs for the markets-context aggregation: compressed
   * all-perp (`pac`) and all-spot (`sac`) asset contexts plus the documented
   * `fastAssetCtxs` feed (high-frequency mid + mark across every dex).
   */
  private getMarketsContextSubEntries(): Array<{
    subKey: string
    payload: object
  }> {
    return [
      { subKey: 'pac', payload: { type: 'pac' } },
      { subKey: 'sac', payload: { type: 'sac' } },
      { subKey: 'fastAssetCtxs', payload: { type: 'fastAssetCtxs' } },
    ]
  }

  private registerOrderbook(marketId: string, orderbookKey: string): void {
    let activeKeys = this.orderbookKeysByMarketId.get(marketId)
    if (activeKeys === undefined) {
      activeKeys = new Set()
      this.orderbookKeysByMarketId.set(marketId, activeKeys)
    }

    activeKeys.add(orderbookKey)
  }

  private releaseOrderbook(marketId: string, orderbookKey: string): void {
    const activeKeys = this.orderbookKeysByMarketId.get(marketId)
    if (activeKeys === undefined) {
      return
    }

    activeKeys.delete(orderbookKey)
    if (activeKeys.size > 0) {
      return
    }

    this.orderbookKeysByMarketId.delete(marketId)
  }

  protected override onClose(): void {
    this.perpCtxBySubDex.clear()
    this.spotCtxByMarketId = {}
    this.fastCtxByMarketId = {}
    this.marketsContextByMarketId = {}
    this.orderbookKeysByMarketId.clear()
    this.latestOrderbookByMarketId.clear()
    this.fastDecodeChain = Promise.resolve()
    this.pacDecodeChain = Promise.resolve()
    this.sacDecodeChain = Promise.resolve()
    this.orderbookDecodeChain = Promise.resolve()
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
      case 'marketContext':
        return `marketContext:${sub.marketId}`
      case 'orderbook':
        return `l2:${sub.marketId}:${this.orderbookAggregationKey(
          sub.marketId,
          sub.priceStep
        )}`
      case 'candle':
        return `candle:${sub.marketId}:${sub.interval}`
      case 'trades':
        return `trades:${sub.marketId}`
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

  private orderbookAggregation(
    marketId: string,
    priceStep: number | undefined
  ): { nSigFigs?: number; mantissa?: number } {
    if (priceStep === undefined) {
      return {}
    }
    return priceStepToAggregation(
      priceStep,
      this.orderbookReferencePrice(marketId)
    )
  }

  private orderbookAggregationKey(
    marketId: string,
    priceStep: number | undefined
  ): string {
    const aggregation = this.orderbookAggregation(marketId, priceStep)
    const nSigFigs = aggregation.nSigFigs ?? null
    const mantissa = aggregation.mantissa ?? null
    if (nSigFigs === null && mantissa === null) {
      return 'full'
    }
    return `s:${nSigFigs}:m:${mantissa}`
  }

  private toHlPayload(sub: Subscription): object {
    switch (sub.channel) {
      case 'marketsContext':
        // Handled via getMarketsContextSubEntries in openChannel; never reaches
        // toHlPayload, but TS requires an exhaustive switch.
        return { type: 'allDexsAssetCtxs' }
      case 'marketContext':
        return {
          type: 'activeAssetCtx',
          coin: sub.marketId,
        }
      case 'orderbook': {
        const aggregation = this.orderbookAggregation(
          sub.marketId,
          sub.priceStep
        )
        return {
          type: 'l2',
          c: sub.marketId,
          s: aggregation.nSigFigs ?? null,
          m: aggregation.mantissa ?? null,
        }
      }
      case 'candle':
        return {
          type: 'candle',
          coin: sub.marketId,
          interval: sub.interval,
        }
      case 'trades':
        return {
          type: 'trades',
          coin: sub.marketId,
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
        case 'pac':
          this.handlePac(msg.data as string)
          break
        case 'sac':
          this.handleSac(msg.data as string)
          break
        case 'fastAssetCtxs':
          this.handleFastAssetCtxs(msg.data as string)
          break
        case 'activeAssetCtx':
          this.handleActiveAssetCtx(msg.data as HlWsActiveAssetCtxData, raw)
          break
        case 'activeSpotAssetCtx':
          this.handleActiveSpotAssetCtx(msg.data as HlWsActiveSpotAssetCtxData)
          break
        case 'l2':
          this.handleL2(msg.data as HlWsL2Data)
          break
        case 'l2Book':
          this.handleL2Book(msg.data as HlWsL2BookData)
          break
        case 'candle':
          this.handleCandle(msg.data as HlWsCandleData)
          break
        case 'trades':
          this.handleTrades(msg.data as HlWsTrade[])
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
    this.emitMarketsContext(
      this.mergePerpAssetCtxEntries(allDexsAssetCtxEntries(data))
    )
  }

  private handlePac(base64: string) {
    this.pacDecodeChain = this.pacDecodeChain
      .then(async () => {
        this.emitMarketsContext(
          this.mergePerpAssetCtxEntries(
            await decodeCompressedJson<HlWsPacData>(base64)
          )
        )
      })
      .catch((error) => wsLog.handlerFailure(this.providerKey, error))
  }

  /** Merge perp asset contexts in place; returns the marketIds this frame touched. */
  private mergePerpAssetCtxEntries(
    entries: [string, HlWsPerpAssetCtxPayload[]][]
  ): Set<string> {
    const touched = new Set<string>()
    for (const [dex, ctxs] of entries) {
      let byMarketId = this.perpCtxBySubDex.get(dex || 'default')
      if (byMarketId === undefined) {
        byMarketId = {}
        this.perpCtxBySubDex.set(dex || 'default', byMarketId)
      }
      for (const ctx of ctxs) {
        const marketId = ctx.coin
        if (marketId === undefined) {
          continue
        }
        const merged = mergePerpAssetCtx(byMarketId[marketId], marketId, ctx)
        if (merged !== undefined) {
          byMarketId[marketId] = merged
          touched.add(marketId)
        }
      }
    }
    return touched
  }

  private handleSac(base64: string) {
    this.sacDecodeChain = this.sacDecodeChain
      .then(async () => {
        const spotMarketIdBySacKey = this.spotMarketIdBySacKey()
        const ctxs = await decodeCompressedJson<HlWsSacData>(base64)
        const touched = new Set<string>()
        for (const [sacKey, ctx] of Object.entries(ctxs)) {
          const marketId = spotMarketIdBySacKey.get(sacKey)
          if (marketId === undefined) {
            continue
          }
          this.spotCtxByMarketId[marketId] = {
            ...this.spotCtxByMarketId[marketId],
            ...ctx,
          }
          touched.add(marketId)
        }
        this.emitMarketsContext(touched)
      })
      .catch((error) => wsLog.handlerFailure(this.providerKey, error))
  }

  private spotMarketIdBySacKey(): Map<string, string> {
    const map = new Map<string, string>()
    for (const market of this.registry?.markets ?? []) {
      if (market.categoryId !== SPOT_MARKET_ID) {
        continue
      }
      map.set(market.id, market.id)
      map.set(
        `${market.baseAsset.displaySymbol}/${market.quoteAsset.displaySymbol}`,
        market.id
      )
    }
    return map
  }

  /**
   * Decode a `fastAssetCtxs` frame (base64 + raw-DEFLATE) and merge its changed
   * coins into the per-market fast-context store. Frames are incremental, so a
   * field absent from this frame keeps its prior value. Decodes are chained to
   * preserve arrival order across the async boundary.
   */
  private handleFastAssetCtxs(base64: string) {
    this.fastDecodeChain = this.fastDecodeChain
      .then(async () => {
        const ctxs = await decodeFastAssetCtxs(base64)
        for (const [marketId, ctx] of Object.entries(ctxs)) {
          const prev = this.fastCtxByMarketId[marketId]
          this.fastCtxByMarketId[marketId] = {
            markPx: 'markPx' in ctx ? ctx.markPx : prev?.markPx,
            midPx: 'midPx' in ctx ? ctx.midPx : prev?.midPx,
          }
        }
        this.emitMarketsContext(Object.keys(ctxs))
      })
      .catch((error) => wsLog.handlerFailure(this.providerKey, error))
  }

  /**
   * Emit the all-markets context map, re-mapping only the markets the incoming
   * frame touched. Each emission is a fresh snapshot object that carries
   * untouched entries over by reference, so a listener holding an earlier
   * snapshot never observes later-frame mutation.
   */
  private emitMarketsContext(touchedMarketIds: Iterable<string>) {
    const data: Record<string, MarketContext> = {
      ...this.marketsContextByMarketId,
    }
    for (const marketId of touchedMarketIds) {
      const context = this.computeMarketContext(marketId)
      if (context === undefined) {
        delete data[marketId]
      } else {
        data[marketId] = context
      }
    }
    this.marketsContextByMarketId = data
    this.emit('marketsContext', { channel: 'marketsContext', data })
  }

  /**
   * Context for one market from the cached feeds: spot asset context when it
   * maps, else perp asset context with mid + mark overlaid from
   * `fastAssetCtxs`, else the fast feed alone — each price standing in for the
   * other where it carries only one of mid/mark.
   */
  private computeMarketContext(marketId: string): MarketContext | undefined {
    const fast = this.fastCtxByMarketId[marketId]
    const spotCtx = this.spotCtxByMarketId[marketId]
    if (spotCtx !== undefined) {
      const context = mapSpotMarketContext(marketId, spotCtx, fast)
      if (context !== undefined) {
        return context
      }
    }
    let perpCtx: HlWsPerpAssetCtx | undefined
    for (const byMarketId of this.perpCtxBySubDex.values()) {
      perpCtx = byMarketId[marketId] ?? perpCtx
    }
    if (perpCtx !== undefined) {
      const base = mapMarketContext(marketId, perpCtx)
      return {
        ...base,
        midPrice: fast?.midPx != null ? fast.midPx : base.midPrice,
        markPrice: fast?.markPx != null ? fast.markPx : base.markPrice,
      }
    }
    const midPrice = fast?.midPx ?? fast?.markPx
    const markPrice = fast?.markPx ?? fast?.midPx
    if (midPrice != null && markPrice != null) {
      return { marketId, midPrice, markPrice }
    }
    return undefined
  }

  private handleActiveAssetCtx(data: HlWsActiveAssetCtxData, raw: string) {
    const ctx = activePerpAssetCtx(data.coin, data.ctx)
    if (ctx === undefined) {
      wsLog.parseFailure(this.providerKey, raw)
      return
    }
    this.emit(`marketContext:${data.coin}`, {
      channel: 'marketContext',
      data: mapMarketContext(data.coin, ctx),
    })
  }

  private handleActiveSpotAssetCtx(data: HlWsActiveSpotAssetCtxData) {
    const context = mapSpotMarketContext(data.coin, data.ctx)
    if (context === undefined) {
      return
    }
    this.emit(`marketContext:${data.coin}`, {
      channel: 'marketContext',
      data: context,
    })
  }

  /** Latest mid per `Market.id` across asset-context and fast feeds. */
  private mergedMids(): Map<string, number> {
    const map = new Map<string, number>()
    for (const byMarketId of this.perpCtxBySubDex.values()) {
      for (const [id, ctx] of Object.entries(byMarketId)) {
        const mid = ctx.midPx ?? ctx.markPx
        map.set(id, Number(mid))
      }
    }
    for (const [id, ctx] of Object.entries(this.spotCtxByMarketId)) {
      const mid = ctx.midPx ?? ctx.markPx
      if (mid != null) {
        map.set(id, Number(mid))
      }
    }
    for (const [id, fast] of Object.entries(this.fastCtxByMarketId)) {
      const mid = fast.midPx ?? fast.markPx
      if (mid != null) {
        map.set(id, Number(mid))
      }
    }
    return map
  }

  private orderbookReferencePrice(marketId: string): number {
    const mid = this.mergedMids().get(marketId)
    if (mid !== undefined) {
      return mid
    }

    const book = this.latestOrderbookByMarketId.get(marketId)
    const bid = book?.bids[0]?.price
    const ask = book?.asks[0]?.price
    if (bid !== undefined && ask !== undefined) {
      return (Number(bid) + Number(ask)) / 2
    }

    return Number.NaN
  }

  private handleL2Book(data: HlWsL2BookData) {
    const book = {
      provider: this.providerKey,
      marketId: data.coin,
      bids: data.levels[0]
        .slice(0, HL_L2_BOOK_MAX_LEVELS_PER_SIDE)
        .map((l) => ({ price: l.px, size: l.sz })),
      asks: data.levels[1]
        .slice(0, HL_L2_BOOK_MAX_LEVELS_PER_SIDE)
        .map((l) => ({ price: l.px, size: l.sz })),
      timestamp: data.time,
    }
    this.latestOrderbookByMarketId.set(data.coin, book)
    this.emitOrderbook(data.coin, book)
  }

  private handleL2(data: HlWsL2Data) {
    if (data.s !== undefined) {
      this.handleL2Book(data.s)
    }
    if (data.u !== undefined) {
      this.handleCompactL2Delta(data.u)
    }
    if (data.c === undefined) {
      return
    }
    const compressed = data.c
    this.orderbookDecodeChain = this.orderbookDecodeChain
      .then(async () => {
        this.handleCompactL2Delta(
          await decodeCompressedJson<HlWsCompressedL2Data>(compressed)
        )
      })
      .catch((error) => wsLog.handlerFailure(this.providerKey, error))
  }

  private handleCompactL2Delta(delta: HlWsCompressedL2Data) {
    const previous = this.latestOrderbookByMarketId.get(delta.c)
    if (previous === undefined) {
      return
    }

    const book: OrderbookResponse = {
      provider: this.providerKey,
      marketId: delta.c,
      bids: applyCompressedL2Side(
        previous.bids,
        delta.l[0],
        delta.r?.[0] ?? [],
        'bid'
      ),
      asks: applyCompressedL2Side(
        previous.asks,
        delta.l[1],
        delta.r?.[1] ?? [],
        'ask'
      ),
      timestamp: delta.t,
    }
    this.latestOrderbookByMarketId.set(delta.c, book)
    this.emitOrderbook(delta.c, book)
  }

  private emitOrderbook(marketId: string, book: OrderbookResponse) {
    const keys = this.orderbookKeysByMarketId.get(marketId)
    if (keys === undefined) {
      return
    }
    for (const key of keys) {
      this.emit(key, { channel: 'orderbook', data: book })
    }
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

  private handleTrades(data: HlWsTrade[]) {
    for (const trade of data) {
      this.emit(`trades:${trade.coin}`, {
        channel: 'trades',
        data: [
          {
            provider: this.providerKey,
            marketId: trade.coin,
            price: trade.px,
            size: trade.sz,
            timestamp: trade.time,
            side: trade.side === 'B' ? 'buy' : 'sell',
            id: trade.tid !== undefined ? String(trade.tid) : trade.hash,
          },
        ],
      })
    }
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
    // The snapshot frame carries up to ~2000 historical fills and is replayed
    // on every reconnect via `replaySubs`; emitting them would surface old
    // fills as live events on each network blip. Suppress it to an empty event
    // (fill history is available via REST `getFills`) so only live fills are
    // delivered as events.
    const items = data.isSnapshot
      ? []
      : data.fills.flatMap((f) => {
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

const toMarketContextString = (value: unknown): string | undefined =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : undefined

const toMarketCapString = (
  price: unknown,
  circulatingSupply: unknown
): string | undefined => {
  const priceString = toMarketContextString(price)
  const supplyString = toMarketContextString(circulatingSupply)
  if (priceString === undefined || supplyString === undefined) {
    return undefined
  }

  try {
    const parsedPrice = new Big(priceString)
    const parsedSupply = new Big(supplyString)
    if (parsedPrice.lte(0) || parsedSupply.lte(0)) {
      return undefined
    }
    return parsedPrice.times(parsedSupply).toFixed()
  } catch {
    return undefined
  }
}

function mergePerpAssetCtx(
  previous: HlWsPerpAssetCtx | undefined,
  marketId: string,
  update: HlWsPerpAssetCtxPayload
): HlWsPerpAssetCtx | undefined {
  const funding = update.funding ?? previous?.funding
  const openInterest = update.openInterest ?? previous?.openInterest
  const dayNtlVlm = update.dayNtlVlm ?? previous?.dayNtlVlm
  const prevDayPx = update.prevDayPx ?? previous?.prevDayPx
  const markPx = update.markPx ?? previous?.markPx
  const midPx = 'midPx' in update ? update.midPx : previous?.midPx
  const oraclePx = update.oraclePx ?? previous?.oraclePx

  if (
    funding === undefined ||
    openInterest === undefined ||
    dayNtlVlm === undefined ||
    prevDayPx === undefined ||
    markPx === undefined ||
    midPx === undefined ||
    oraclePx === undefined
  ) {
    return undefined
  }

  return {
    coin: marketId,
    funding,
    openInterest,
    dayNtlVlm,
    prevDayPx,
    markPx,
    midPx,
    oraclePx,
  }
}

function allDexsAssetCtxEntries(
  data: HlWsAllDexsAssetCtxsData
): [string, HlWsPerpAssetCtxPayload[]][] {
  return data.assetCtxs ?? data.ctxs ?? []
}

function activePerpAssetCtx(
  marketId: string,
  ctx: HlWsActiveAssetCtxData['ctx']
): HlWsPerpAssetCtx | undefined {
  const funding = toMarketContextString(ctx.funding)
  const openInterest = toMarketContextString(ctx.openInterest)
  const dayNtlVlm = toMarketContextString(ctx.dayNtlVlm)
  const prevDayPx = toMarketContextString(ctx.prevDayPx)
  const markPx = toMarketContextString(ctx.markPx)
  const midPx =
    ctx.midPx === undefined || ctx.midPx === null
      ? null
      : (toMarketContextString(ctx.midPx) ?? null)
  const oraclePx = toMarketContextString(ctx.oraclePx)

  if (
    funding === undefined ||
    openInterest === undefined ||
    dayNtlVlm === undefined ||
    prevDayPx === undefined ||
    markPx === undefined ||
    oraclePx === undefined
  ) {
    return undefined
  }

  return {
    coin: marketId,
    funding,
    openInterest,
    dayNtlVlm,
    prevDayPx,
    markPx,
    midPx,
    oraclePx,
  }
}

function mapSpotMarketContext(
  marketId: string,
  ctx: HlWsSpotAssetCtx,
  fast?: HlWsFastAssetCtx
): MarketContext | undefined {
  const midPrice = toMarketContextString(ctx.midPx ?? ctx.markPx)
  const markPrice = toMarketContextString(ctx.markPx)
  if (midPrice === undefined || markPrice === undefined) {
    return undefined
  }

  const emittedMarkPrice = fast?.markPx != null ? fast.markPx : markPrice
  return {
    marketId,
    midPrice: fast?.midPx != null ? fast.midPx : midPrice,
    markPrice: emittedMarkPrice,
    prevDayPrice: toMarketContextString(ctx.prevDayPx),
    volume24h: toMarketContextString(ctx.dayNtlVlm),
    marketCap: toMarketCapString(emittedMarkPrice, ctx.circulatingSupply),
  }
}

function compactRemovalPrice(
  levels: OrderbookLevel[],
  value: number | string | { p: string }
): string | undefined {
  if (typeof value === 'number') {
    return levels[value]?.price
  }
  return typeof value === 'string' ? value : value.p
}

function applyCompressedL2Side(
  previous: OrderbookLevel[],
  updates: HlWsCompressedL2Data['l'][number],
  removals: NonNullable<HlWsCompressedL2Data['r']>[number],
  side: 'bid' | 'ask'
): OrderbookLevel[] {
  const byPrice = new Map(previous.map((level) => [level.price, level.size]))
  for (const removal of removals) {
    const price = compactRemovalPrice(previous, removal)
    if (price !== undefined) {
      byPrice.delete(price)
    }
  }
  for (const update of updates) {
    if (Number(update.s) === 0) {
      byPrice.delete(update.p)
    } else {
      byPrice.set(update.p, update.s)
    }
  }

  return [...byPrice.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) =>
      side === 'bid'
        ? Number(b.price) - Number(a.price)
        : Number(a.price) - Number(b.price)
    )
    .slice(0, HL_L2_BOOK_MAX_LEVELS_PER_SIDE)
}

/**
 * Minimal presence/type check of the channel-discriminating and required
 * fields the matching handler dereferences without its own guard. A frame
 * that parses but fails this is a bad frame (log + skip), distinct from a
 * handler that throws on otherwise-shaped data. Unknown channels pass through
 * to the dispatch switch, which silently ignores them.
 */
function isValidHlFrame(channel: string, data: unknown): boolean {
  // `fastAssetCtxs` carries a base64 string payload, not an object.
  if (channel === 'fastAssetCtxs' || channel === 'pac' || channel === 'sac') {
    return typeof data === 'string'
  }
  if (!isObject(data)) {
    return false
  }
  switch (channel) {
    case 'allDexsAssetCtxs':
      return Array.isArray(data.assetCtxs) || Array.isArray(data.ctxs)
    case 'activeAssetCtx':
    case 'activeSpotAssetCtx':
      return typeof data.coin === 'string' && isObject(data.ctx)
    case 'l2Book':
      return (
        typeof data.coin === 'string' &&
        Array.isArray(data.levels) &&
        Array.isArray(data.levels[0]) &&
        Array.isArray(data.levels[1]) &&
        typeof data.time === 'number'
      )
    case 'l2':
      return typeof data.c === 'string' || isObject(data.s) || isObject(data.u)
    case 'candle':
      return typeof data.s === 'string' && typeof data.i === 'string'
    case 'trades':
      return Array.isArray(data)
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
