import type { Subscription, SubscriptionEvent } from '@lifi/perps-types'
import { HistoryItemStatus, OrderSide, OrderType } from '@lifi/perps-types'
import type {
  HlAssetPosition,
  HlOrderDetail,
  HlUserFill,
} from '@lifi/perps-types/providers/hyperliquid'
import {
  mapHistoryItem,
  mapOrder,
  mapPosition,
} from '@lifi/perps-types/providers/hyperliquid'
import { ReconnectingWebSocket } from '../ReconnectingWebSocket.js'
import type { SubscriptionListener, WsProvider } from '../types.js'
import type {
  HlWsAllMidsData,
  HlWsCandleData,
  HlWsL2BookData,
  HlWsMessage,
  HlWsTrade,
  HlWsUserFillsData,
  HlWsWebData2Data,
} from './types.js'

export class HyperliquidWsProvider implements WsProvider {
  private rws: ReconnectingWebSocket
  private subs = new Map<string, { count: number; payload: object }>()
  private listeners = new Map<string, Set<SubscriptionListener>>()
  private readonly dexKey: string
  private readonly assetIdLookup: Map<string, number>

  constructor(
    wsUrl: string,
    dexKey: string,
    assetIdLookup: Map<string, number>
  ) {
    this.dexKey = dexKey
    this.assetIdLookup = assetIdLookup
    this.rws = new ReconnectingWebSocket(wsUrl)
    this.rws.on('message', (data) => this.handleMessage(data))
    this.rws.on('open', () => this.resubscribeAll())
  }

  async subscribe(
    sub: Subscription,
    listener: SubscriptionListener
  ): Promise<() => void> {
    const key = this.toKey(sub)
    const payload = this.toHlPayload(sub)

    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key)!.add(listener)

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

  close() {
    this.rws.close()
    this.subs.clear()
    this.listeners.clear()
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
        return `l2Book:${sub.symbol}`
      case 'trades':
        return `trades:${sub.symbol}`
      case 'candle':
        return `candle:${sub.symbol}:${sub.interval}`
      case 'orderUpdates':
        return `orderUpdates:${sub.address}`
      case 'fills':
        return `userFills:${sub.address}`
      case 'positions':
        return `webData2:${sub.address}`
    }
  }

  private toHlPayload(sub: Subscription): object {
    switch (sub.channel) {
      case 'prices':
        return { type: 'allMids' }
      case 'orderbook':
        return {
          type: 'l2Book',
          coin: sub.symbol,
          ...(sub.depth !== undefined ? { nLevels: sub.depth } : {}),
        }
      case 'trades':
        return { type: 'trades', coin: sub.symbol }
      case 'candle':
        return { type: 'candle', coin: sub.symbol, interval: sub.interval }
      case 'orderUpdates':
        return { type: 'orderUpdates', user: sub.address }
      case 'fills':
        return { type: 'userFills', user: sub.address }
      case 'positions':
        return { type: 'webData2', user: sub.address }
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
      return
    }
    if (
      !msg.channel ||
      msg.channel === 'pong' ||
      msg.channel === 'subscriptionResponse'
    ) {
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
        case 'trades':
          this.handleTrades(msg.data as HlWsTrade[])
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
        case 'webData2':
          this.handleWebData2(msg.data as HlWsWebData2Data)
          break
      }
    } catch {
      // Skip malformed messages
    }
  }

  private handleAllMids(data: HlWsAllMidsData) {
    this.emit('allMids', { channel: 'prices', data: { prices: data.mids } })
  }

  private handleL2Book(data: HlWsL2BookData) {
    this.emit(`l2Book:${data.coin}`, {
      channel: 'orderbook',
      data: {
        dex: this.dexKey,
        symbol: data.coin,
        bids: data.levels[0].map((l) => ({ price: l.px, size: l.sz })),
        asks: data.levels[1].map((l) => ({ price: l.px, size: l.sz })),
        timestamp: data.time,
      },
    })
  }

  private handleTrades(data: HlWsTrade[]) {
    if (data.length === 0) {
      return
    }
    const coin = data[0].coin
    const items = data.map((t) => ({
      id: String(t.tid),
      symbol: t.coin,
      assetId: this.assetIdLookup.get(t.coin) ?? -1,
      dex: this.dexKey,
      side: t.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
      type: OrderType.MARKET,
      size: t.sz,
      price: t.px,
      status: HistoryItemStatus.FILLED,
      filledSize: t.sz,
      createdAt: new Date(t.time).toISOString(),
    }))
    this.emit(`trades:${coin}`, { channel: 'trades', data: items })
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
    const orders = data.map((d) => mapOrder(d))
    this.emitToPrefix('orderUpdates:', {
      channel: 'orderUpdates',
      data: orders,
    })
  }

  private handleUserFills(data: HlWsUserFillsData) {
    const items = data.fills.map((f) =>
      mapHistoryItem(f as HlUserFill, this.dexKey, this.assetIdLookup)
    )
    this.emit(`userFills:${data.user}`, { channel: 'fills', data: items })
  }

  private handleWebData2(data: HlWsWebData2Data) {
    const positions = data.clearinghouseState.assetPositions.map((ap) =>
      mapPosition(ap as HlAssetPosition, this.dexKey, this.assetIdLookup)
    )
    this.emit(`webData2:${data.user}`, {
      channel: 'positions',
      data: positions,
    })
  }
}
