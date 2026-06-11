import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { mockProviders, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import * as getProvidersModule from '../services/getProviders.js'
import { PerpsWsClient, type WsProviderFactory } from './PerpsWsClient.js'

const mockSubscribe = vi.fn().mockResolvedValue(() => {})
const mockSubscribeQuote = vi.fn().mockResolvedValue(() => {})
const mockClose = vi.fn()
const mockReconnect = vi.fn()

const buildHlFactory = () =>
  vi.fn<WsProviderFactory>((_params) => ({
    subscribe: mockSubscribe,
    reconnect: mockReconnect,
    subscribeQuote: mockSubscribeQuote,
    close: mockClose,
  }))

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

  describe('subscribe', () => {
    it('should call the registered factory on first subscribe', async () => {
      useWsUrlHandler()
      const factory = buildHlFactory()
      const ws = makeWs(factory)

      await ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())

      expect(factory).toHaveBeenCalledOnce()
      expect(factory).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'hyperliquid',
          wsUrl: 'wss://api.hyperliquid.xyz/ws',
          markets: ['hyperliquid', 'xyz'],
        })
      )

      ws.close()
    })

    it('passes the raw market list — provider-specific filtering is the factory’s job', async () => {
      useWsUrlHandler()
      const factory = buildHlFactory()
      const ws = makeWs(factory)

      await ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())

      expect(factory.mock.calls[0][0].markets).toEqual(['hyperliquid', 'xyz'])

      ws.close()
    })

    it('should reuse cached provider for same provider', async () => {
      useWsUrlHandler()
      const factory = buildHlFactory()
      const ws = makeWs(factory)

      await ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())
      await ws.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', assetId: 'BTC' },
        vi.fn()
      )

      expect(factory).toHaveBeenCalledOnce()

      ws.close()
    })

    it('should delegate subscription to the provider', async () => {
      useWsUrlHandler()
      const ws = makeWs(buildHlFactory())
      const listener = vi.fn()
      const sub = { channel: 'prices' as const, dex: 'hyperliquid' }

      await ws.subscribe(sub, listener)

      expect(mockSubscribe).toHaveBeenCalledWith(sub, listener, undefined)

      ws.close()
    })

    it('attempts provider recovery before delegating subscribe', async () => {
      useWsUrlHandler()
      const ws = makeWs(buildHlFactory())
      const listener = vi.fn()
      const sub = { channel: 'prices' as const, dex: 'hyperliquid' }

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
      const sub = { channel: 'prices' as const, dex: 'hyperliquid' }

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
        { channel: 'prices', dex: 'hyperliquid' },
        vi.fn()
      )

      expect(unsub).toBe(mockUnsub)

      ws.close()
    })

    it('should throw when no factory is registered for the provider', async () => {
      useWsUrlHandler()
      const ws = new PerpsWsClient(createClient())

      await expect(
        ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())
      ).rejects.toThrow("No WS provider factory registered for 'hyperliquid'.")

      ws.close()
    })

    it('should throw when provider has no WebSocket URL', async () => {
      // Default mock providers have no wsUrl
      const ws = makeWs(buildHlFactory())

      await expect(
        ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())
      ).rejects.toThrow('No WebSocket URL found for provider: hyperliquid')

      ws.close()
    })

    it('should throw for unknown provider', async () => {
      useWsUrlHandler()
      const ws = makeWs(buildHlFactory())

      await expect(
        ws.subscribe({ channel: 'prices', dex: 'unknown-provider' }, vi.fn())
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
        ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())
      ).rejects.toThrow('transient /providers failure')
      expect(factory).not.toHaveBeenCalled()

      await ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())
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
        ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn()),
        ws.subscribe(
          { channel: 'orderbook', dex: 'hyperliquid', assetId: 'BTC' },
          vi.fn()
        ),
      ])

      expect(factory).toHaveBeenCalledOnce()

      ws.close()
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
          size: 100,
          type: 'perps',
        },
        onQuote
      )

      expect(factory).toHaveBeenCalledOnce()
      expect(mockSubscribeQuote).toHaveBeenCalledWith(
        { symbol: 'BTC', side: 'buy', size: 100, type: 'perps' },
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
            size: 100,
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

      await ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())

      ws.close()

      expect(mockClose).toHaveBeenCalledOnce()
    })

    it('should be safe to call close with no providers', () => {
      const ws = new PerpsWsClient(createClient())
      expect(() => ws.close()).not.toThrow()
    })
  })

  describe('reconnect', () => {
    it('reconnects an existing provider', async () => {
      useWsUrlHandler()
      const ws = makeWs(buildHlFactory())

      await ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())
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
