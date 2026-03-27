import type {
  Position,
  Subscription,
  SubscriptionEvent,
} from '@lifi/perps-types'
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
  HlWsClearinghouseStateData,
  HlWsL2BookData,
  HlWsMessage,
  HlWsSpotClearinghouseStateData,
  HlWsUserFillsData,
} from './types.js'

export class HyperliquidWsProvider implements WsProvider {
  private rws: ReconnectingWebSocket
  private subs = new Map<string, { count: number; payload: object }>()
  private listeners = new Map<string, Set<SubscriptionListener>>()
  private readonly providerKey: string
  private readonly assetIdLookup: Map<string, number>
  private readonly subDexes: string[]
  private positionsBySubDex = new Map<string, Position[]>()
  private midsBySubDex = new Map<string, Record<string, string>>()

  constructor(
    wsUrl: string,
    providerKey: string,
    assetIdLookup: Map<string, number>,
    subDexes: string[]
  ) {
    this.providerKey = providerKey
    this.assetIdLookup = assetIdLookup
    this.subDexes = subDexes
    this.rws = new ReconnectingWebSocket(wsUrl)
    this.rws.on('message', (data) => this.handleMessage(data))
    this.rws.on('open', () => this.resubscribeAll())
  }

  async subscribe(
    sub: Subscription,
    listener: SubscriptionListener
  ): Promise<() => void> {
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

    // Positions require multi-sub-dex clearinghouseState subscriptions
    if (sub.channel === 'positions') {
      const entries = this.getPositionSubEntries(sub.address)

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
          this.positionsBySubDex.clear()
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

  /** Build sub-key + payload pairs for each sub-dex clearinghouseState subscription. */
  private getPositionSubEntries(
    address: string
  ): Array<{ subKey: string; payload: object }> {
    const addr = address.toLowerCase()
    return [
      {
        subKey: `positions:${addr}:default`,
        payload: { type: 'clearinghouseState', user: address },
      },
      ...this.subDexes.map((dex) => ({
        subKey: `positions:${addr}:${dex}`,
        payload: { type: 'clearinghouseState', user: address, dex },
      })),
    ]
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
      case 'candle':
        return `candle:${sub.symbol}:${sub.interval}`
      case 'orderUpdates':
        return `orderUpdates:${sub.address.toLowerCase()}`
      case 'fills':
        return `userFills:${sub.address.toLowerCase()}`
      case 'positions':
        return `positions:${sub.address.toLowerCase()}`
      case 'spotBalances':
        return `spotClearinghouseState:${sub.address.toLowerCase()}`
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
          coin: sub.symbol,
          ...(sub.depth !== undefined ? { nLevels: sub.depth } : {}),
        }
      case 'candle':
        return { type: 'candle', coin: sub.symbol, interval: sub.interval }
      case 'orderUpdates':
        return { type: 'orderUpdates', user: sub.address }
      case 'fills':
        return { type: 'userFills', user: sub.address }
      case 'positions':
        // Positions are handled via getPositionSubEntries in subscribe()
        // and never reach toHlPayload, but TS requires exhaustive cases.
        return { type: 'clearinghouseState', user: sub.address }
      case 'spotBalances':
        return { type: 'spotClearinghouseState', user: sub.address }
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
        case 'candle':
          this.handleCandle(msg.data as HlWsCandleData)
          break
        case 'orderUpdates':
          this.handleOrderUpdates(msg.data as HlOrderDetail[])
          break
        case 'userFills':
          this.handleUserFills(msg.data as HlWsUserFillsData)
          break
        case 'clearinghouseState':
          this.handleClearinghouseState(msg.data as HlWsClearinghouseStateData)
          break
        case 'spotClearinghouseState':
          this.handleSpotClearinghouseState(
            msg.data as HlWsSpotClearinghouseStateData
          )
          break
      }
    } catch {
      // Skip malformed messages
    }
  }

  private handleAllMids(data: HlWsAllMidsData) {
    const subDexKey = data.dex || 'default'
    this.midsBySubDex.set(subDexKey, data.mids)

    // Merge all sub-dex mids into a single record
    const merged: Record<string, string> = {}
    for (const mids of this.midsBySubDex.values()) {
      Object.assign(merged, mids)
    }

    this.emit('allMids', { channel: 'prices', data: { prices: merged } })
  }

  private handleL2Book(data: HlWsL2BookData) {
    this.emit(`l2Book:${data.coin}`, {
      channel: 'orderbook',
      data: {
        provider: this.providerKey,
        symbol: data.coin,
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
    const orders = data.map((d) => mapOrder(d))
    this.emitToPrefix('orderUpdates:', {
      channel: 'orderUpdates',
      data: orders,
    })
  }

  private handleUserFills(data: HlWsUserFillsData) {
    const items = data.fills.map((f) =>
      mapHistoryItem(f as HlUserFill, this.providerKey, this.assetIdLookup)
    )
    this.emit(`userFills:${data.user}`, { channel: 'fills', data: items })
  }

  private handleClearinghouseState(data: HlWsClearinghouseStateData) {
    const subDexKey = data.dex || 'default'
    const positions = data.clearinghouseState.assetPositions.map((ap) =>
      mapPosition(ap as HlAssetPosition, this.providerKey, this.assetIdLookup)
    )
    this.positionsBySubDex.set(subDexKey, positions)

    // Merge all sub-dex positions into a single flat array
    const merged = [...this.positionsBySubDex.values()].flat()

    this.emit(`positions:${data.user.toLowerCase()}`, {
      channel: 'positions',
      data: merged,
    })
  }

  private handleSpotClearinghouseState(data: HlWsSpotClearinghouseStateData) {
    const balances = data.balances.map((b) => ({
      coin: b.coin,
      total: b.total,
      hold: b.hold,
    }))
    this.emit(`spotClearinghouseState:${data.user.toLowerCase()}`, {
      channel: 'spotBalances',
      data: balances,
    })
  }
}
