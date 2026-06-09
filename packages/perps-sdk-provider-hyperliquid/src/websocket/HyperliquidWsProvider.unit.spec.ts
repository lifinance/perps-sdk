import {
  type PerpsSDKClient,
  WS_CHANNEL_TEARDOWN_LINGER_MS,
} from '@lifi/perps-sdk'
import type { Market } from '@lifi/perps-types'
import { FillStatus, OrderSide, OrderType } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { HL_MARKETS, HL_SPOT_MARKET } from '../../test/fixtures.js'
import { HyperliquidWsProvider } from './HyperliquidWsProvider.js'

const XYZ_BRENTOIL_MARKET: Market = {
  providerId: 'hyperliquid',
  id: 'xyz:BRENTOIL',
  categoryId: 'xyz',
  baseAsset: {
    providerId: 'hyperliquid',
    id: 'BRENTOIL',
    displaySymbol: 'BRENTOIL',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: '',
  },
} as Market

// --- Mock ReconnectingWebSocket ---

const { MockRws, getMockRwsInstance } = vi.hoisted(() => {
  let instance: any

  class MockRws {
    onMessageHandlers: Array<(data: string) => void> = []
    onOpenHandlers: Array<() => void> = []
    onStatusHandlers: Array<(status: string) => void> = []
    sent: string[] = []
    closed = false
    status = 'connected'

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

    onStatus(fn: (status: string) => void) {
      this.onStatusHandlers.push(fn)
    }

    offStatus() {}

    getStatus() {
      return this.status
    }

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
      this.status = 'connected'
      for (const fn of this.onOpenHandlers) {
        fn()
      }
    }

    simulateStatus(status: string) {
      this.status = status
      for (const fn of this.onStatusHandlers) {
        fn(status)
      }
    }
  }

  return { MockRws, getMockRwsInstance: () => instance }
})

const { getMarketsMock } = vi.hoisted(() => ({
  getMarketsMock: vi.fn(),
}))

vi.mock('@lifi/perps-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lifi/perps-sdk')>()
  return {
    ...actual,
    ReconnectingWebSocket: MockRws,
    getMarkets: getMarketsMock,
  }
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

const fakeClient = {} as PerpsSDKClient

/** Provider wired to a client whose `getMarkets` returns `markets`. */
function createEnrichingProvider(
  markets = [...HL_MARKETS, HL_SPOT_MARKET]
): HyperliquidWsProvider {
  getMarketsMock.mockResolvedValue({ markets })
  return new HyperliquidWsProvider(
    'wss://api.hyperliquid.xyz/ws',
    providerKey,
    subDexes,
    fakeClient
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

    it('unsubscribes both default + xyz allMids when the prices listener unsubscribes', async () => {
      vi.useFakeTimers()
      try {
        const provider = createProvider()

        const unsub = await provider.subscribe(
          { channel: 'prices', dex: 'hyperliquid' },
          vi.fn()
        )

        getMockRwsInstance().sent = [] // Clear the two subscribe messages.
        unsub()
        vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS) // fire the deferred teardown

        expect(getMockRwsInstance().sent).toHaveLength(2)
        const unsubPayloads = getMockRwsInstance().sent.map((s) =>
          JSON.parse(s)
        )
        expect(unsubPayloads).toContainEqual({
          method: 'unsubscribe',
          subscription: { type: 'allMids' },
        })
        expect(unsubPayloads).toContainEqual({
          method: 'unsubscribe',
          subscription: { type: 'allMids', dex: 'xyz' },
        })
      } finally {
        vi.useRealTimers()
      }
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

    it('maps nSigFigs onto the l2Book frame and never sends the ignored nLevels', async () => {
      const provider = createProvider()

      await provider.subscribe(
        {
          channel: 'orderbook',
          dex: 'hyperliquid',
          marketId: 'BTC',
          depth: 30,
          nSigFigs: 4,
        },
        vi.fn()
      )

      const subscription = JSON.parse(getMockRwsInstance().sent[0]).subscription
      expect(subscription).toEqual({ type: 'l2Book', coin: 'BTC', nSigFigs: 4 })
      expect(subscription).not.toHaveProperty('nLevels')
    })

    it('forwards mantissa only when nSigFigs is 5', async () => {
      const provider = createProvider()

      await provider.subscribe(
        {
          channel: 'orderbook',
          dex: 'hyperliquid',
          marketId: 'BTC',
          nSigFigs: 5,
          mantissa: 2,
        },
        vi.fn()
      )

      expect(JSON.parse(getMockRwsInstance().sent[0]).subscription).toEqual({
        type: 'l2Book',
        coin: 'BTC',
        nSigFigs: 5,
        mantissa: 2,
      })
    })

    it('drops mantissa when nSigFigs is not 5 (HL only honours it at full granularity)', async () => {
      const provider = createProvider()

      await provider.subscribe(
        {
          channel: 'orderbook',
          dex: 'hyperliquid',
          marketId: 'BTC',
          nSigFigs: 3,
          mantissa: 2,
        },
        vi.fn()
      )

      const subscription = JSON.parse(getMockRwsInstance().sent[0]).subscription
      expect(subscription).toEqual({ type: 'l2Book', coin: 'BTC', nSigFigs: 3 })
      expect(subscription).not.toHaveProperty('mantissa')
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

    it('sends a single allDexsClearinghouseState subscribe for positions', async () => {
      const provider = createProvider()

      await provider.subscribe(
        { channel: 'positions', dex: 'hyperliquid', address: '0xabc' },
        vi.fn()
      )

      expect(getMockRwsInstance().sent).toHaveLength(1)
      expect(JSON.parse(getMockRwsInstance().sent[0])).toEqual({
        method: 'subscribe',
        subscription: { type: 'allDexsClearinghouseState', user: '0xabc' },
      })
    })

    it('sends a single allDexsClearinghouseState unsubscribe when the positions listener unsubscribes', async () => {
      vi.useFakeTimers()
      try {
        const provider = createProvider()

        const unsub = await provider.subscribe(
          { channel: 'positions', dex: 'hyperliquid', address: '0xabc' },
          vi.fn()
        )

        getMockRwsInstance().sent = [] // Clear subscribe messages
        unsub()
        vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS) // fire the deferred teardown

        expect(getMockRwsInstance().sent).toHaveLength(1)
        expect(JSON.parse(getMockRwsInstance().sent[0])).toEqual({
          method: 'unsubscribe',
          subscription: { type: 'allDexsClearinghouseState', user: '0xabc' },
        })
      } finally {
        vi.useRealTimers()
      }
    })

    it('retries the market-map fetch on the next subscribe after a transient failure', async () => {
      getMarketsMock.mockReset()
      getMarketsMock
        .mockRejectedValueOnce(new Error('coreGetMarkets boom'))
        .mockResolvedValue({ markets: [...HL_MARKETS, XYZ_BRENTOIL_MARKET] })
      const provider = new HyperliquidWsProvider(
        'wss://api.hyperliquid.xyz/ws',
        providerKey,
        subDexes,
        fakeClient
      )

      await expect(
        provider.subscribe(
          { channel: 'positions', dex: 'hyperliquid', address: '0xuser1' },
          vi.fn()
        )
      ).rejects.toThrow('coreGetMarkets boom')

      const listener = vi.fn()
      await provider.subscribe(
        { channel: 'positions', dex: 'hyperliquid', address: '0xuser1' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allDexsClearinghouseState',
          data: {
            user: '0xuser1',
            clearinghouseStates: [
              [
                '',
                {
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
              ],
            ],
          },
        })
      )

      expect(getMarketsMock).toHaveBeenCalledTimes(2)
      expect(listener).toHaveBeenCalledOnce()
      expect(listener.mock.calls[0][0].data[0]).toMatchObject({
        market: { id: 'BTC' },
        size: '0.1',
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

    it('caps emitted orderbook levels at HL per-side limit of 20', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        listener
      )

      const side = Array.from({ length: 25 }, (_, i) => ({
        px: String(95000 - i),
        sz: '1',
        n: 1,
      }))
      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'l2Book',
          data: { coin: 'BTC', levels: [side, side], time: 1704067200000 },
        })
      )

      const event = listener.mock.calls[0][0]
      expect(event.data.bids).toHaveLength(20)
      expect(event.data.asks).toHaveLength(20)
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
      const provider = createEnrichingProvider()
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
      const provider = createEnrichingProvider()
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

    it('emits typed spot Balances keyed on the wire token index', async () => {
      const PURR_SPOT: Market = {
        providerId: 'hyperliquid',
        id: 'PURR/USDC',
        categoryId: 'spot',
        baseAsset: {
          providerId: 'hyperliquid',
          id: '5',
          displaySymbol: 'PURR',
          logoURI: '',
        },
        quoteAsset: {
          providerId: 'hyperliquid',
          id: '0',
          displaySymbol: 'USDC',
          logoURI: '',
        },
        szDecimals: 2,
        markPrice: '0.5',
        maxLeverage: 1,
        onlyIsolated: false,
        funding: { rate: '0', nextFundingTime: 0 },
      } as Market
      const provider = createEnrichingProvider([...HL_MARKETS, PURR_SPOT])
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'spotBalances', dex: 'hyperliquid', address: '0xuser1' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'spotState',
          data: {
            user: '0xuser1',
            spotState: {
              balances: [
                { coin: 'PURR', token: 5, total: '100', hold: '10' },
                { coin: 'USDC', token: 0, total: '500', hold: '0' },
                { coin: 'GHOST', token: 9, total: '1', hold: '0' },
              ],
            },
          },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.channel).toBe('spotBalances')
      expect(event.data).toEqual([
        {
          categoryId: 'spot',
          asset: {
            providerId: 'hyperliquid',
            id: '5',
            displaySymbol: 'PURR',
            logoURI: 'https://app.hyperliquid.xyz/coins/PURR.svg',
          },
          units: '100',
          valueUsd: '50',
          locked: '10',
        },
        {
          categoryId: 'spot',
          asset: {
            providerId: 'hyperliquid',
            id: '0',
            displaySymbol: 'USDC',
            logoURI: 'https://app.hyperliquid.xyz/coins/USDC.svg',
          },
          units: '500',
          valueUsd: '500',
          locked: '0',
        },
        {
          categoryId: 'spot',
          asset: {
            providerId: 'hyperliquid',
            id: '9',
            displaySymbol: 'GHOST',
            logoURI: 'https://app.hyperliquid.xyz/coins/GHOST.svg',
          },
          units: '1',
          // No market for GHOST → unpriced.
          valueUsd: '0',
          locked: '0',
        },
      ])
      // Contract invariant: a held Balance.asset.id equals that token's
      // SpotMarket.baseAsset.id (the token index), so the widget joins by id.
      expect(event.data[0].asset.id).toBe(PURR_SPOT.baseAsset.id)
    })

    it('emits combined positions across dexes from one allDexsClearinghouseState frame', async () => {
      const provider = createEnrichingProvider([
        ...HL_MARKETS,
        XYZ_BRENTOIL_MARKET,
      ])
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'positions', dex: 'hyperliquid', address: '0xuser1' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allDexsClearinghouseState',
          data: {
            user: '0xuser1',
            clearinghouseStates: [
              [
                '',
                {
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
              ],
              [
                'xyz',
                {
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
              ],
            ],
          },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.channel).toBe('positions')
      expect(event.data).toHaveLength(2)
      expect(event.data.map((p: any) => p.market.id)).toContain('BTC')
      expect(event.data.map((p: any) => p.market.id)).toContain('xyz:BRENTOIL')
      expect(event.data.find((p: any) => p.market.id === 'BTC')).toMatchObject({
        size: '0.1',
        entryPrice: '94000',
        leverage: 10,
      })
    })

    it('enriches a spot order onto the backend BASE/QUOTE display and spot logo', async () => {
      const provider = createEnrichingProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'orderUpdates', dex: 'hyperliquid', address: '0xuser1' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'orderUpdates',
          data: [
            {
              order: {
                oid: 100,
                coin: '@142',
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

      const event = listener.mock.calls[0][0]
      expect(event.data.openOrders[0].market.baseAsset.displaySymbol).toBe(
        'BTC/USDC'
      )
      expect(event.data.openOrders[0].market.baseAsset.logoURI).toBe(
        'https://app.hyperliquid.xyz/coins/BTC_spot.svg'
      )
    })

    it('leaves a perp position display unchanged after enrichment', async () => {
      const provider = createEnrichingProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'positions', dex: 'hyperliquid', address: '0xuser1' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allDexsClearinghouseState',
          data: {
            user: '0xuser1',
            clearinghouseStates: [
              [
                '',
                {
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
              ],
            ],
          },
        })
      )

      const event = listener.mock.calls[0][0]
      expect(event.data[0].market.id).toBe('BTC')
      expect(event.data[0].market.baseAsset.displaySymbol).toBe('BTC')
    })

    it('surfaces (logs) a fill on a market absent from /markets instead of swallowing it', async () => {
      const provider = createEnrichingProvider(HL_MARKETS)
      const listener = vi.fn()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

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
                coin: '@142',
                side: 'B',
                px: '94000',
                sz: '0.1',
                dir: 'Buy',
                fee: '4.70',
                closedPnl: '0',
                time: 1704067200000,
                startPosition: '0.0',
              },
            ],
          },
        })
      )

      expect(listener).not.toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledOnce()
      errorSpy.mockRestore()
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

    it('logs and skips malformed JSON without emitting', async () => {
      const provider = createProvider()
      const listener = vi.fn()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage('not valid json{{{')

      expect(listener).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledOnce()
      warnSpy.mockRestore()
    })

    it('surfaces an error-channel frame as a server error, not a parse failure', async () => {
      const provider = createProvider()
      const listener = vi.fn()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'error',
          data: 'Already subscribed: {"type":"allMids"}',
        })
      )

      expect(listener).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledOnce()
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('server error'),
        'Already subscribed: {"type":"allMids"}'
      )
      warnSpy.mockRestore()
      errorSpy.mockRestore()
    })

    it('logs and skips a structurally-invalid frame before it reaches the mapper', async () => {
      const provider = createProvider()
      const listener = vi.fn()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        listener
      )

      // Parseable l2Book frame missing the required `levels` tuple.
      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'l2Book',
          data: { coin: 'BTC', time: 1704067200000 },
        })
      )

      expect(listener).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledOnce()
      expect(errorSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
      errorSpy.mockRestore()
    })

    it('isolates a throwing frame so a later good frame on another channel still delivers', async () => {
      const provider = createEnrichingProvider(HL_MARKETS)
      const priceListener = vi.fn()
      const fillListener = vi.fn()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        priceListener
      )
      await provider.subscribe(
        { channel: 'fills', dex: 'hyperliquid', address: '0xuser1' },
        fillListener
      )

      // Unknown-market fill frame: its handler throws MarketNotFound.
      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'userFills',
          data: {
            isSnapshot: false,
            user: '0xuser1',
            fills: [
              {
                tid: 555,
                coin: '@142',
                side: 'B',
                px: '94000',
                sz: '0.1',
                dir: 'Buy',
                fee: '4.70',
                closedPnl: '0',
                time: 1704067200000,
                startPosition: '0.0',
              },
            ],
          },
        })
      )

      // A subsequent good frame on a different channel must still be delivered.
      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allMids',
          data: { mids: { BTC: '95000' } },
        })
      )

      expect(errorSpy).toHaveBeenCalledOnce()
      expect(fillListener).not.toHaveBeenCalled()
      expect(priceListener).toHaveBeenCalledWith({
        channel: 'prices',
        data: { BTC: '95000' },
      })
      errorSpy.mockRestore()
    })

    it('should not notify a listener after it unsubscribes', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      const unsub = await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        listener
      )

      unsub()

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allMids',
          data: { mids: { BTC: '96000' } },
        })
      )

      expect(listener).not.toHaveBeenCalled()
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

    it('does not double-subscribe when subscribing before the socket opens', async () => {
      const provider = createProvider()
      // Subscriptions made while the socket is still connecting are recorded
      // but must not be sent inline — the open handler resubscribes them.
      // Sending in both places makes HL reply "Already subscribed".
      getMockRwsInstance().status = 'reconnecting'

      await provider.subscribe(
        { channel: 'positions', dex: 'hyperliquid', address: '0xabc' },
        vi.fn()
      )

      expect(getMockRwsInstance().sent).toHaveLength(0)

      getMockRwsInstance().simulateOpen()

      const payloads = getMockRwsInstance().sent.map((s) => JSON.parse(s))
      expect(payloads).toEqual([
        {
          method: 'subscribe',
          subscription: { type: 'allDexsClearinghouseState', user: '0xabc' },
        },
      ])
    })
  })

  describe('connection status', () => {
    it('forwards underlying connection status to the subscriber onStatus', async () => {
      const provider = createProvider()
      const onStatus = vi.fn()

      await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        vi.fn(),
        onStatus
      )

      // Current status delivered synchronously on subscribe.
      expect(onStatus).toHaveBeenLastCalledWith('connected')

      getMockRwsInstance().simulateStatus('reconnecting')
      expect(onStatus).toHaveBeenLastCalledWith('reconnecting')

      getMockRwsInstance().simulateStatus('disconnected')
      expect(onStatus).toHaveBeenLastCalledWith('disconnected')
    })

    it('stops notifying onStatus after the subscription is removed', async () => {
      const provider = createProvider()
      const onStatus = vi.fn()

      const unsubscribe = await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        vi.fn(),
        onStatus
      )
      onStatus.mockClear()
      unsubscribe()

      getMockRwsInstance().simulateStatus('disconnected')
      expect(onStatus).not.toHaveBeenCalled()
    })

    it('delivers status to each active subscription and drops it on unsubscribe', async () => {
      const provider = createProvider()
      const onStatusA = vi.fn()
      const onStatusB = vi.fn()

      const unsubA = await provider.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        vi.fn(),
        onStatusA
      )
      await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        vi.fn(),
        onStatusB
      )

      unsubA()
      onStatusA.mockClear()
      onStatusB.mockClear()

      getMockRwsInstance().simulateStatus('reconnecting')
      expect(onStatusA).not.toHaveBeenCalled()
      expect(onStatusB).toHaveBeenCalledWith('reconnecting')
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
