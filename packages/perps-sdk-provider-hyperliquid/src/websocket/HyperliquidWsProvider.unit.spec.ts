import { FillStatus, OrderSide, OrderType } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { HyperliquidWsProvider } from './HyperliquidWsProvider.js'

// --- Mock ReconnectingWebSocket ---

const { MockRws, getMockRwsInstance } = vi.hoisted(() => {
  let instance: any

  class MockRws {
    onMessageHandlers: Array<(data: string) => void> = []
    onOpenHandlers: Array<() => void> = []
    sent: string[] = []
    closed = false

    constructor() {
      instance = this
    }

    on(event: string, fn: (...args: any[]) => void) {
      if (event === 'message') {
        this.onMessageHandlers.push(fn)
      }
      if (event === 'open') {
        this.onOpenHandlers.push(fn)
      }
    }

    off() {}

    send(data: string) {
      this.sent.push(data)
    }

    ready() {
      return Promise.resolve()
    }

    close() {
      this.closed = true
    }

    simulateMessage(data: string) {
      for (const fn of this.onMessageHandlers) {
        fn(data)
      }
    }

    simulateOpen() {
      for (const fn of this.onOpenHandlers) {
        fn()
      }
    }
  }

  return { MockRws, getMockRwsInstance: () => instance }
})

vi.mock('@lifi/perps-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lifi/perps-sdk')>()
  return { ...actual, ReconnectingWebSocket: MockRws }
})

// --- Test setup ---

const providerKey = 'hyperliquid'
const subDexes = ['xyz']

function createProvider(): HyperliquidWsProvider {
  return new HyperliquidWsProvider(
    'wss://api.hyperliquid.xyz/ws',
    providerKey,
    subDexes
  )
}

describe('HyperliquidWsProvider', () => {
  describe('subscribe', () => {
    it('should send subscribe message for default and sub-dex allMids', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener
      )

      expect(getMockRwsInstance().sent).toHaveLength(2)
      const payloads = getMockRwsInstance().sent.map((s) => JSON.parse(s))
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: { type: 'allMids' },
      })
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: { type: 'allMids', dex: 'xyz' },
      })
    })

    it('should return an unsubscribe function', async () => {
      const provider = createProvider()
      const unsub = await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        vi.fn()
      )

      expect(typeof unsub).toBe('function')
    })

    it('should ref-count subscriptions - second subscriber does not send again', async () => {
      const provider = createProvider()

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        vi.fn()
      )
      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        vi.fn()
      )

      // Only two subscribe messages (default + xyz), not four
      expect(getMockRwsInstance().sent).toHaveLength(2)
    })

    it('should send unsubscribe when last listener unsubscribes', async () => {
      const provider = createProvider()

      const unsub1 = await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        vi.fn()
      )
      const unsub2 = await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        vi.fn()
      )

      unsub1()
      // Still one subscriber, no unsubscribe sent (2 initial subscribes)
      expect(getMockRwsInstance().sent).toHaveLength(2)

      unsub2()
      // Last subscriber removed, unsubscribes for both default + xyz
      expect(getMockRwsInstance().sent).toHaveLength(4)
      const unsubPayloads = getMockRwsInstance()
        .sent.slice(2)
        .map((s) => JSON.parse(s))
      expect(unsubPayloads).toContainEqual({
        method: 'unsubscribe',
        subscription: { type: 'allMids' },
      })
      expect(unsubPayloads).toContainEqual({
        method: 'unsubscribe',
        subscription: { type: 'allMids', dex: 'xyz' },
      })
    })

    it('should map orderbook subscription to l2Book payload', async () => {
      const provider = createProvider()

      await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        vi.fn()
      )

      expect(JSON.parse(getMockRwsInstance().sent[0])).toEqual({
        method: 'subscribe',
        subscription: { type: 'l2Book', coin: 'BTC' },
      })
    })

    it('should map candle subscription to candle payload', async () => {
      const provider = createProvider()

      await provider.subscribe(
        {
          channel: 'candle',
          dex: 'hyperliquid',
          marketId: 'BTC',
          interval: '1h',
        },
        vi.fn()
      )

      expect(JSON.parse(getMockRwsInstance().sent[0])).toEqual({
        method: 'subscribe',
        subscription: { type: 'candle', coin: 'BTC', interval: '1h' },
      })
    })

    it('should map orderUpdates subscription to orderUpdates payload', async () => {
      const provider = createProvider()

      await provider.subscribe(
        {
          channel: 'orderUpdates',
          dex: 'hyperliquid',
          address: '0xabc',
        },
        vi.fn()
      )

      expect(JSON.parse(getMockRwsInstance().sent[0])).toEqual({
        method: 'subscribe',
        subscription: { type: 'orderUpdates', user: '0xabc' },
      })
    })

    it('should map fills subscription to userFills payload', async () => {
      const provider = createProvider()

      await provider.subscribe(
        { channel: 'fills', dex: 'hyperliquid', address: '0xabc' },
        vi.fn()
      )

      expect(JSON.parse(getMockRwsInstance().sent[0])).toEqual({
        method: 'subscribe',
        subscription: { type: 'userFills', user: '0xabc' },
      })
    })

    it('should send clearinghouseState subscribe for default and xyz sub-dexes', async () => {
      const provider = createProvider()

      await provider.subscribe(
        { channel: 'positions', dex: 'hyperliquid', address: '0xabc' },
        vi.fn()
      )

      expect(getMockRwsInstance().sent).toHaveLength(2)
      const payloads = getMockRwsInstance().sent.map((s) => JSON.parse(s))
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: { type: 'clearinghouseState', user: '0xabc' },
      })
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: {
          type: 'clearinghouseState',
          user: '0xabc',
          dex: 'xyz',
        },
      })
    })

    it('should send two unsubscribe messages when positions listener unsubscribes', async () => {
      const provider = createProvider()

      const unsub = await provider.subscribe(
        { channel: 'positions', dex: 'hyperliquid', address: '0xabc' },
        vi.fn()
      )

      getMockRwsInstance().sent = [] // Clear subscribe messages
      unsub()

      expect(getMockRwsInstance().sent).toHaveLength(2)
      const payloads = getMockRwsInstance().sent.map((s) => JSON.parse(s))
      expect(payloads).toContainEqual({
        method: 'unsubscribe',
        subscription: { type: 'clearinghouseState', user: '0xabc' },
      })
      expect(payloads).toContainEqual({
        method: 'unsubscribe',
        subscription: {
          type: 'clearinghouseState',
          user: '0xabc',
          dex: 'xyz',
        },
      })
    })
  })

  describe('message handling', () => {
    it('should emit prices event for allMids channel', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allMids',
          data: { mids: { BTC: '95000', ETH: '3400' } },
        })
      )

      expect(listener).toHaveBeenCalledWith({
        channel: 'prices',
        data: { BTC: '95000', ETH: '3400' },
      })
    })

    it('should merge sub-dex allMids with default mids', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener
      )

      // Default allMids
      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allMids',
          data: { mids: { BTC: '95000', ETH: '3400' } },
        })
      )

      // xyz sub-dex allMids
      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allMids',
          data: { dex: 'xyz', mids: { BRENTOIL: '70.50', GOLD: '2300' } },
        })
      )

      expect(listener).toHaveBeenCalledTimes(2)
      const lastEvent = listener.mock.calls[1][0]
      expect(lastEvent).toEqual({
        channel: 'prices',
        data: {
          BTC: '95000',
          ETH: '3400',
          BRENTOIL: '70.50',
          GOLD: '2300',
        },
      })
    })

    it('should emit orderbook event for l2Book channel', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'l2Book',
          data: {
            coin: 'BTC',
            levels: [
              [{ px: '94999', sz: '1.5', n: 3 }],
              [{ px: '95001', sz: '1.0', n: 2 }],
            ],
            time: 1704067200000,
          },
        })
      )

      expect(listener).toHaveBeenCalledWith({
        channel: 'orderbook',
        data: {
          provider: 'hyperliquid',
          marketId: 'BTC',
          bids: [{ price: '94999', size: '1.5' }],
          asks: [{ price: '95001', size: '1.0' }],
          timestamp: 1704067200000,
        },
      })
    })

    it('should emit candle event for candle channel', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        {
          channel: 'candle',
          dex: 'hyperliquid',
          marketId: 'BTC',
          interval: '1h',
        },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'candle',
          data: {
            t: 1704063600000,
            T: 1704067200000,
            s: 'BTC',
            i: '1h',
            o: '94000',
            c: '95000',
            h: '95500',
            l: '93500',
            v: '100',
            n: 50,
          },
        })
      )

      expect(listener).toHaveBeenCalledWith({
        channel: 'candle',
        data: {
          t: 1704063600000,
          o: '94000',
          h: '95500',
          l: '93500',
          c: '95000',
          v: '100',
        },
      })
    })

    it('should emit orderUpdates event using prefix matching', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        {
          channel: 'orderUpdates',
          dex: 'hyperliquid',
          address: '0xuser1',
        },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'orderUpdates',
          data: [
            {
              order: {
                oid: 100,
                coin: 'BTC',
                side: 'B',
                sz: '0.05',
                limitPx: '93000',
                orderType: 'Limit',
                origSz: '0.1',
                reduceOnly: false,
                timestamp: 1704067200000,
                tif: 'Gtc',
                cloid: null,
                triggerCondition: 'N/A',
                triggerPx: null,
              },
              status: 'open',
              statusTimestamp: 1704067200000,
            },
          ],
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.channel).toBe('orderUpdates')
      expect(event.data.openOrders).toHaveLength(1)
      expect(event.data.triggerOrders).toHaveLength(0)
      expect(event.data.openOrders[0]).toMatchObject({
        orderId: '100',
        market: { id: 'BTC' },
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
      })
    })

    it('should emit fills event for userFills channel', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'fills', dex: 'hyperliquid', address: '0xuser1' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'userFills',
          data: {
            isSnapshot: false,
            user: '0xuser1',
            fills: [
              {
                tid: 555,
                coin: 'BTC',
                side: 'B',
                px: '94000',
                sz: '0.1',
                dir: 'Open Long',
                fee: '4.70',
                closedPnl: '0',
                time: 1704067200000,
                startPosition: '0.0',
              },
            ],
          },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.channel).toBe('fills')
      expect(event.data).toHaveLength(1)
      expect(event.data[0]).toMatchObject({
        id: '555',
        market: { id: 'BTC' },
        side: OrderSide.BUY,
        price: '94000',
        size: '0.1',
        fee: '4.70',
        status: FillStatus.FILLED,
      })
    })

    it('should emit combined positions for clearinghouseState messages', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'positions', dex: 'hyperliquid', address: '0xuser1' },
        listener
      )

      // Default sub-dex (native BTC position)
      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'clearinghouseState',
          data: {
            dex: '',
            user: '0xuser1',
            clearinghouseState: {
              assetPositions: [
                {
                  position: {
                    coin: 'BTC',
                    szi: '0.1',
                    entryPx: '94000',
                    positionValue: '9500',
                    liquidationPx: '85000',
                    unrealizedPnl: '100',
                    marginUsed: '940',
                    leverage: { type: 'cross', value: 10 },
                  },
                },
              ],
            },
          },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      const event1 = listener.mock.calls[0][0]
      expect(event1.channel).toBe('positions')
      expect(event1.data).toHaveLength(1)
      expect(event1.data[0]).toMatchObject({
        market: { id: 'BTC' },
        size: '0.1',
        entryPrice: '94000',
        leverage: 10,
      })

      // xyz sub-dex (HIP-3 BRENTOIL position) — should merge with native
      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'clearinghouseState',
          data: {
            dex: 'xyz',
            user: '0xuser1',
            clearinghouseState: {
              assetPositions: [
                {
                  position: {
                    coin: 'xyz:BRENTOIL',
                    szi: '-0.45',
                    entryPx: '70.50',
                    positionValue: '31.725',
                    liquidationPx: '90.00',
                    unrealizedPnl: '-2.50',
                    marginUsed: '15.86',
                    leverage: { type: 'isolated', value: 2 },
                  },
                },
              ],
            },
          },
        })
      )

      expect(listener).toHaveBeenCalledTimes(2)
      const event2 = listener.mock.calls[1][0]
      expect(event2.channel).toBe('positions')
      expect(event2.data).toHaveLength(2)
      expect(event2.data.map((p: any) => p.market.id)).toContain('BTC')
      expect(event2.data.map((p: any) => p.market.id)).toContain('xyz:BRENTOIL')
    })

    it('should ignore pong messages', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage(JSON.stringify({ channel: 'pong' }))

      expect(listener).not.toHaveBeenCalled()
    })

    it('should ignore subscriptionResponse messages', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'subscriptionResponse',
          data: { method: 'subscribe' },
        })
      )

      expect(listener).not.toHaveBeenCalled()
    })

    it('should ignore malformed JSON', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage('not valid json{{{')

      expect(listener).not.toHaveBeenCalled()
    })

    it('should notify multiple listeners on same subscription', async () => {
      const provider = createProvider()
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener1
      )
      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener2
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allMids',
          data: { mids: { BTC: '96000' } },
        })
      )

      expect(listener1).toHaveBeenCalledOnce()
      expect(listener2).toHaveBeenCalledOnce()
    })

    it('should not notify unsubscribed listener', async () => {
      const provider = createProvider()
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      const unsub1 = await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener1
      )
      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener2
      )

      unsub1()

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allMids',
          data: { mids: { BTC: '96000' } },
        })
      )

      expect(listener1).not.toHaveBeenCalled()
      expect(listener2).toHaveBeenCalledOnce()
    })

    it('should route messages to correct subscription only', async () => {
      const provider = createProvider()
      const btcListener = vi.fn()
      const ethListener = vi.fn()

      await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        btcListener
      )
      await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'ETH' },
        ethListener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'l2Book',
          data: {
            coin: 'BTC',
            levels: [
              [{ px: '95000', sz: '1', n: 1 }],
              [{ px: '95001', sz: '1', n: 1 }],
            ],
            time: 1704067200000,
          },
        })
      )

      expect(btcListener).toHaveBeenCalledOnce()
      expect(ethListener).not.toHaveBeenCalled()
    })
  })

  describe('resubscribe on reconnect', () => {
    it('should resend all active subscriptions on open', async () => {
      const provider = createProvider()

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        vi.fn()
      )
      await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        vi.fn()
      )

      getMockRwsInstance().sent = [] // Clear initial subscribe messages

      // Simulate reconnection
      getMockRwsInstance().simulateOpen()

      // 2 allMids (default + xyz) + 1 l2Book
      expect(getMockRwsInstance().sent).toHaveLength(3)
      const payloads = getMockRwsInstance().sent.map((s) => JSON.parse(s))
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: { type: 'allMids' },
      })
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: { type: 'allMids', dex: 'xyz' },
      })
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: { type: 'l2Book', coin: 'BTC' },
      })
    })
  })

  describe('close', () => {
    it('should close the underlying WebSocket', () => {
      const provider = createProvider()
      provider.close()

      expect(getMockRwsInstance().closed).toBe(true)
    })

    it('should not emit events after close', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener
      )

      provider.close()

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allMids',
          data: { mids: { BTC: '95000' } },
        })
      )

      expect(listener).not.toHaveBeenCalled()
    })
  })
})
