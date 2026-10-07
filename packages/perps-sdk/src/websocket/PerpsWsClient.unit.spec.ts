import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockProviders, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import * as getProvidersModule from '../services/getProviders.js'
import {
  PerpsWsClient,
  type WsProviderFactory,
  type WsProviderFactoryParams,
} from './PerpsWsClient.js'
import type { WsProvider } from './types.js'

const mockSubscribe = vi.fn().mockResolvedValue(() => {})
const mockSubscribeQuote = vi.fn().mockResolvedValue(() => {})
const mockClose = vi.fn()
const mockReconnect = vi.fn()

const buildHlFactory = ({
  streamsCandles = true,
  streamsAvailableToTrade = true,
} = {}) =>
  Object.assign(
    vi.fn<(params: WsProviderFactoryParams) => WsProvider>((_params) => ({
      subscribe: mockSubscribe,
      reconnect: mockReconnect,
      subscribeQuote: mockSubscribeQuote,
      close: mockClose,
    })),
    { streamsCandles, streamsAvailableToTrade }
  )

const providersWithWsUrl = {
  providers: mockProviders.providers.map((d) => ({
    ...d,
    wsUrl: 'wss://api.hyperliquid.xyz/ws',
    categories: [
      { id: 'hyperliquid', quoteAsset: null },
      { id: 'xyz', quoteAsset: null },
    ],
  })),
}

function useWsUrlHandler() {
  server.use(
    http.get(`${DEFAULT_API_URL}/providers`, () =>
      HttpResponse.json(providersWithWsUrl)
    )
  )
}

function createClient() {
  return createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })
}

function makeWs(factory: WsProviderFactory) {
  return new PerpsWsClient(createClient(), {
    wsProviders: { hyperliquid: factory },
  })
}

describe('PerpsWsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('streamsCandles', () => {
    it('reports the registered factory flag without instantiating the provider', () => {
      const factory = buildHlFactory()
      const ws = makeWs(factory)

      expect(ws.streamsCandles('hyperliquid')).toBe(true)
      expect(factory).not.toHaveBeenCalled()
    })

    it('reports false for a factory that does not stream candles', () => {
      const ws = makeWs(buildHlFactory({ streamsCandles: false }))

      expect(ws.streamsCandles('hyperliquid')).toBe(false)
    })

    it('reports false when no factory is registered for the provider', () => {
      const ws = makeWs(buildHlFactory())

      expect(ws.streamsCandles('lighter')).toBe(false)
    })
  })

  describe('streamsAvailableToTrade', () => {
    it('reports the registered factory flag without instantiating the provider', () => {
      const factory = buildHlFactory()
      const ws = makeWs(factory)

      expect(ws.streamsAvailableToTrade('hyperliquid')).toBe(true)
      expect(factory).not.toHaveBeenCalled()
    })

    it('reports false for a factory that does not stream availableToTrade', () => {
      const ws = makeWs(buildHlFactory({ streamsAvailableToTrade: false }))

      expect(ws.streamsAvailableToTrade('hyperliquid')).toBe(false)
    })

    it('reports false when no factory is registered for the provider', () => {
      const ws = makeWs(buildHlFactory())

      expect(ws.streamsAvailableToTrade('lighter')).toBe(false)
    })
  })

  describe('subscribe', () => {
    it('should call the registered factory on first subscribe', async () => {
      useWsUrlHandler()
      const factory = buildHlFactory()
      const ws = makeWs(factory)

      await ws.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )

      expect(factory).toHaveBeenCalledOnce()
      expect(factory).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'hyperliquid',
          wsUrl: 'wss://api.hyperliquid.xyz/ws',
        })
      )

      ws.close()
    })

    it('passes no market list to the factory', async () => {
      useWsUrlHandler()
      const factory = buildHlFactory()
      const ws = makeWs(factory)

      await ws.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )

      expect(factory.mock.calls[0][0]).not.toHaveProperty('markets')

      ws.close()
    })

    it('should reuse cached provider for same provider', async () => {
      useWsUrlHandler()
      const factory = buildHlFactory()
      const ws = makeWs(factory)

      await ws.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )
      await ws.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        vi.fn()
      )

      expect(factory).toHaveBeenCalledOnce()

      ws.close()
    })

    it('should delegate subscription to the provider', async () => {
      useWsUrlHandler()
      const ws = makeWs(buildHlFactory())
      const listener = vi.fn()
      const sub = { channel: 'marketsContext' as const, dex: 'hyperliquid' }

      await ws.subscribe(sub, listener)

      expect(mockSubscribe).toHaveBeenCalledWith(sub, listener, undefined)

      ws.close()
    })

    it('attempts provider recovery before delegating subscribe', async () => {
      useWsUrlHandler()
      const ws = makeWs(buildHlFactory())
      const listener = vi.fn()
      const sub = { channel: 'marketsContext' as const, dex: 'hyperliquid' }

      await ws.subscribe(sub, listener)

      expect(mockReconnect).toHaveBeenCalledOnce()
      expect(mockReconnect.mock.invocationCallOrder[0]).toBeLessThan(
        mockSubscribe.mock.invocationCallOrder[0]
      )

      ws.close()
    })

    it('should forward the onStatus listener to the provider', async () => {
      useWsUrlHandler()
      const ws = makeWs(buildHlFactory())
      const listener = vi.fn()
      const onStatus = vi.fn()
      const sub = { channel: 'marketsContext' as const, dex: 'hyperliquid' }

      await ws.subscribe(sub, listener, onStatus)

      expect(mockSubscribe).toHaveBeenCalledWith(sub, listener, onStatus)

      ws.close()
    })

    it('should return unsubscribe function from provider', async () => {
      useWsUrlHandler()
      const mockUnsub = vi.fn()
      mockSubscribe.mockResolvedValueOnce(mockUnsub)

      const ws = makeWs(buildHlFactory())
      const unsub = await ws.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )

      expect(unsub).toBe(mockUnsub)

      ws.close()
    })

    it('should throw when no factory is registered for the provider', async () => {
      useWsUrlHandler()
      const ws = new PerpsWsClient(createClient())

      await expect(
        ws.subscribe({ channel: 'marketsContext', dex: 'hyperliquid' }, vi.fn())
      ).rejects.toThrow("No WS provider factory registered for 'hyperliquid'.")

      ws.close()
    })

    it('should throw when provider has no WebSocket URL', async () => {
      // Default mock providers have no wsUrl
      const ws = makeWs(buildHlFactory())

      await expect(
        ws.subscribe({ channel: 'marketsContext', dex: 'hyperliquid' }, vi.fn())
      ).rejects.toThrow('No WebSocket URL found for provider: hyperliquid')

      ws.close()
    })

    it('should throw for unknown provider', async () => {
      useWsUrlHandler()
      const ws = makeWs(buildHlFactory())

      await expect(
        ws.subscribe(
          { channel: 'marketsContext', dex: 'unknown-provider' },
          vi.fn()
        )
      ).rejects.toThrow(
        "No WS provider factory registered for 'unknown-provider'."
      )

      ws.close()
    })

    it('retries init on the next subscribe after a transient init failure', async () => {
      const getProvidersMock = vi
        .spyOn(getProvidersModule, 'getProviders')
        .mockRejectedValueOnce(new Error('transient /providers failure'))
        .mockResolvedValue(providersWithWsUrl)
      const factory = buildHlFactory()
      const ws = makeWs(factory)

      await expect(
        ws.subscribe({ channel: 'marketsContext', dex: 'hyperliquid' }, vi.fn())
      ).rejects.toThrow('transient /providers failure')
      expect(factory).not.toHaveBeenCalled()

      await ws.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )
      expect(factory).toHaveBeenCalledOnce()
      expect(getProvidersMock).toHaveBeenCalledTimes(2)

      getProvidersMock.mockRestore()
      ws.close()
    })

    it('should handle concurrent subscribes for same provider without race', async () => {
      useWsUrlHandler()
      const factory = buildHlFactory()
      const ws = makeWs(factory)

      const [_unsub1, _unsub2] = await Promise.all([
        ws.subscribe(
          { channel: 'marketsContext', dex: 'hyperliquid' },
          vi.fn()
        ),
        ws.subscribe(
          { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
          vi.fn()
        ),
      ])

      expect(factory).toHaveBeenCalledOnce()

      ws.close()
    })
  })

  describe('provider discovery', () => {
    const venueWsUrls: Record<string, string> = {
      hyperliquid: 'wss://hl.example/ws',
      lighter: 'wss://lighter.example/ws',
      ondo: 'wss://ondo.example/ws',
    }
    const venues = Object.keys(venueWsUrls)
    const threeVenueProviders = {
      providers: venues.map((key) => ({
        ...mockProviders.providers[0],
        key,
        wsUrl: venueWsUrls[key],
      })),
    }

    function useGatedProviders(apiUrl = DEFAULT_API_URL) {
      let open!: () => void
      let fail!: () => void
      const gate = new Promise<boolean>((resolve) => {
        open = () => resolve(true)
        fail = () => resolve(false)
      })
      const requests = { count: 0 }
      server.use(
        http.get(`${apiUrl}/providers`, async () => {
          requests.count++
          return (await gate)
            ? HttpResponse.json(threeVenueProviders)
            : new HttpResponse(null, { status: 400 })
        })
      )
      return { open, fail, requests }
    }

    function makeMultiVenueWs(client = createClient()) {
      const factories = Object.fromEntries(
        venues.map((venue) => [venue, buildHlFactory()])
      )
      return {
        ws: new PerpsWsClient(client, { wsProviders: factories }),
        factories,
      }
    }

    function subscribeTwicePerVenue(ws: PerpsWsClient) {
      return venues.flatMap((dex) => [
        ws.subscribe({ channel: 'marketsContext', dex }, vi.fn()),
        ws.subscribe({ channel: 'orderbook', dex, marketId: 'BTC' }, vi.fn()),
      ])
    }

    it('fetches /providers once for six concurrent subscriptions across three venues', async () => {
      const { open, requests } = useGatedProviders()
      const { ws, factories } = makeMultiVenueWs()

      const subs = subscribeTwicePerVenue(ws)
      open()
      await Promise.all(subs)

      expect(requests.count).toBe(1)
      for (const venue of venues) {
        expect(factories[venue]).toHaveBeenCalledOnce()
        expect(factories[venue]).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: venue,
            wsUrl: venueWsUrls[venue],
          })
        )
      }

      ws.close()
    })

    it('keeps one /providers request on the single-venue path', async () => {
      const { open, requests } = useGatedProviders()
      const { ws, factories } = makeMultiVenueWs()

      const subs = [
        ws.subscribe({ channel: 'marketsContext', dex: 'lighter' }, vi.fn()),
        ws.subscribe(
          { channel: 'orderbook', dex: 'lighter', marketId: 'BTC' },
          vi.fn()
        ),
      ]
      open()
      await Promise.all(subs)

      expect(requests.count).toBe(1)
      expect(factories.lighter).toHaveBeenCalledOnce()

      ws.close()
    })

    it('fetches fresh metadata for a venue initialized after discovery settles, and keeps existing providers', async () => {
      const { open, requests } = useGatedProviders()
      const { ws, factories } = makeMultiVenueWs()
      open()

      await ws.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )
      await ws.subscribe({ channel: 'marketsContext', dex: 'lighter' }, vi.fn())
      await ws.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        vi.fn()
      )

      expect(requests.count).toBe(2)
      expect(factories.hyperliquid).toHaveBeenCalledOnce()
      expect(factories.lighter).toHaveBeenCalledOnce()

      ws.close()
    })

    it('does not share discovery between two clients with different API URLs', async () => {
      const otherApiUrl = 'https://other.example/v1/perps'
      const first = useGatedProviders()
      const second = useGatedProviders(otherApiUrl)
      const a = makeMultiVenueWs()
      const b = makeMultiVenueWs(
        createPerpsClient({
          integrator: 'test-app',
          apiKey: 'other-key',
          apiUrl: otherApiUrl,
        })
      )

      const subs = [
        ...subscribeTwicePerVenue(a.ws),
        ...subscribeTwicePerVenue(b.ws),
      ]
      first.open()
      second.open()
      await Promise.all(subs)

      expect(first.requests.count).toBe(1)
      expect(second.requests.count).toBe(1)

      a.ws.close()
      b.ws.close()
    })

    it('rejects every current waiter on a failed discovery, then retries on the next subscribe', async () => {
      const { fail, requests } = useGatedProviders()
      const { ws, factories } = makeMultiVenueWs()

      const results = Promise.allSettled(subscribeTwicePerVenue(ws))
      fail()
      const settled = await results

      expect(requests.count).toBe(1)
      expect(settled.every((r) => r.status === 'rejected')).toBe(true)
      for (const venue of venues) {
        expect(factories[venue]).not.toHaveBeenCalled()
      }

      const { open } = useGatedProviders()
      open()
      await ws.subscribe({ channel: 'marketsContext', dex: 'ondo' }, vi.fn())

      expect(factories.ondo).toHaveBeenCalledOnce()

      ws.close()
    })

    it('rejects only the venue without a wsUrl when discovery is shared', async () => {
      server.use(
        http.get(`${DEFAULT_API_URL}/providers`, () =>
          HttpResponse.json({
            providers: threeVenueProviders.providers.map((p) =>
              p.key === 'ondo' ? { ...p, wsUrl: undefined } : p
            ),
          })
        )
      )
      const { ws, factories } = makeMultiVenueWs()

      const [hl, lighter, ondo] = await Promise.allSettled(
        venues.map((dex) =>
          ws.subscribe({ channel: 'marketsContext', dex }, vi.fn())
        )
      )

      expect(hl.status).toBe('fulfilled')
      expect(lighter.status).toBe('fulfilled')
      expect(ondo).toMatchObject({
        status: 'rejected',
        reason: new Error('No WebSocket URL found for provider: ondo'),
      })
      expect(factories.ondo).not.toHaveBeenCalled()

      ws.close()
    })

    it('opens no socket for any venue when closed during shared discovery', async () => {
      const { open, requests } = useGatedProviders()
      const { ws, factories } = makeMultiVenueWs()

      const results = Promise.allSettled(subscribeTwicePerVenue(ws))
      ws.close()
      open()
      const settled = await results

      expect(requests.count).toBe(1)
      for (const result of settled) {
        expect(result).toMatchObject({
          status: 'rejected',
          reason: expect.objectContaining({
            message: expect.stringContaining('PerpsWsClient is closed'),
          }),
        })
      }
      for (const venue of venues) {
        expect(factories[venue]).not.toHaveBeenCalled()
      }
    })
  })

  describe('subscribeQuote', () => {
    it('delegates to the provider with the SPI params and returns its unsubscribe', async () => {
      useWsUrlHandler()
      const mockUnsub = vi.fn()
      mockSubscribeQuote.mockResolvedValueOnce(mockUnsub)
      const factory = buildHlFactory()
      const ws = makeWs(factory)
      const onQuote = vi.fn()

      const unsub = await ws.subscribeQuote(
        {
          provider: 'hyperliquid',
          symbol: 'BTC',
          side: 'buy',
          size: '100',
          type: 'perps',
        },
        onQuote
      )

      expect(factory).toHaveBeenCalledOnce()
      expect(mockSubscribeQuote).toHaveBeenCalledWith(
        { symbol: 'BTC', side: 'buy', size: '100', type: 'perps' },
        onQuote
      )
      expect(unsub).toBe(mockUnsub)

      ws.close()
    })

    it('throws when no factory is registered for the provider', async () => {
      useWsUrlHandler()
      const ws = new PerpsWsClient(createClient())

      await expect(
        ws.subscribeQuote(
          {
            provider: 'hyperliquid',
            symbol: 'BTC',
            side: 'buy',
            size: '100',
            type: 'perps',
          },
          vi.fn()
        )
      ).rejects.toThrow("No WS provider factory registered for 'hyperliquid'.")

      ws.close()
    })
  })

  describe('close', () => {
    it('should close all providers', async () => {
      useWsUrlHandler()
      const ws = makeWs(buildHlFactory())

      await ws.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )

      ws.close()

      expect(mockClose).toHaveBeenCalledOnce()
    })

    it('should be safe to call close with no providers', () => {
      const ws = new PerpsWsClient(createClient())
      expect(() => ws.close()).not.toThrow()
    })

    it('aborts an init suspended at getProviders: no socket, map stays empty, subscribe rejects', async () => {
      let resolveProviders!: (value: typeof providersWithWsUrl) => void
      const deferred = new Promise<typeof providersWithWsUrl>((resolve) => {
        resolveProviders = resolve
      })
      const getProvidersMock = vi
        .spyOn(getProvidersModule, 'getProviders')
        .mockReturnValue(deferred)
      const factory = buildHlFactory()
      const ws = makeWs(factory)

      const subPromise = ws.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )
      ws.close()
      resolveProviders(providersWithWsUrl)

      await expect(subPromise).rejects.toThrow('PerpsWsClient is closed')
      expect(factory).not.toHaveBeenCalled()
      ws.reconnect('hyperliquid')
      expect(mockReconnect).not.toHaveBeenCalled()

      getProvidersMock.mockRestore()
    })

    it('rejects subscribe() issued after close()', async () => {
      useWsUrlHandler()
      const ws = makeWs(buildHlFactory())
      await ws.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )

      ws.close()

      await expect(
        ws.subscribe({ channel: 'marketsContext', dex: 'hyperliquid' }, vi.fn())
      ).rejects.toThrow('PerpsWsClient is closed')
    })

    it('rejects subscribeQuote() issued after close()', async () => {
      useWsUrlHandler()
      const ws = makeWs(buildHlFactory())

      ws.close()

      await expect(
        ws.subscribeQuote(
          {
            provider: 'hyperliquid',
            symbol: 'BTC',
            side: 'buy',
            size: '100',
            type: 'perps',
          },
          vi.fn()
        )
      ).rejects.toThrow('PerpsWsClient is closed')
    })
  })

  describe('reconnect', () => {
    it('reconnects an existing provider', async () => {
      useWsUrlHandler()
      const ws = makeWs(buildHlFactory())

      await ws.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )
      mockReconnect.mockClear()

      ws.reconnect('hyperliquid')
      expect(mockReconnect).toHaveBeenCalledOnce()

      ws.close()
    })

    it('is a safe no-op for unknown providers', () => {
      const ws = makeWs(buildHlFactory())

      expect(() => ws.reconnect('hyperliquid')).not.toThrow()
      expect(mockReconnect).not.toHaveBeenCalled()
    })
  })
})
