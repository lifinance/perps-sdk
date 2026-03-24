import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { mockProviders, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { PerpsWsClient } from './PerpsWsClient.js'

// --- Mock HyperliquidWsProvider ---

const mockSubscribe = vi.fn().mockResolvedValue(() => {})
const mockClose = vi.fn()

vi.mock('./hyperliquid/HyperliquidWsProvider.js', () => ({
  HyperliquidWsProvider: vi.fn().mockImplementation(() => ({
    subscribe: mockSubscribe,
    close: mockClose,
  })),
}))

import { HyperliquidWsProvider } from './hyperliquid/HyperliquidWsProvider.js'

const MockedHlProvider = vi.mocked(HyperliquidWsProvider)

// --- Helpers ---

const providersWithWsUrl = {
  providers: mockProviders.providers.map((d) => ({
    ...d,
    wsUrl: 'wss://api.hyperliquid.xyz/ws',
    extraData: {
      venues: [
        { name: '', quoteAsset: 'USDC' },
        { name: 'xyz', quoteAsset: 'USDC' },
      ],
    },
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

describe('PerpsWsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('subscribe', () => {
    it('should create a provider on first subscribe', async () => {
      useWsUrlHandler()
      const ws = new PerpsWsClient(createClient())

      await ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())

      expect(MockedHlProvider).toHaveBeenCalledOnce()
      expect(MockedHlProvider).toHaveBeenCalledWith(
        'wss://api.hyperliquid.xyz/ws',
        'hyperliquid',
        expect.any(Map),
        ['xyz']
      )

      ws.close()
    })

    it('should pass asset ID lookup from markets', async () => {
      useWsUrlHandler()
      const ws = new PerpsWsClient(createClient())

      await ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())

      const assetIdLookup = MockedHlProvider.mock.calls[0][2]
      expect(assetIdLookup.get('BTC')).toBe(0)
      expect(assetIdLookup.get('ETH')).toBe(1)

      ws.close()
    })

    it('should reuse cached provider for same provider', async () => {
      useWsUrlHandler()
      const ws = new PerpsWsClient(createClient())

      await ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())
      await ws.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', symbol: 'BTC' },
        vi.fn()
      )

      expect(MockedHlProvider).toHaveBeenCalledOnce()

      ws.close()
    })

    it('should delegate subscription to the provider', async () => {
      useWsUrlHandler()
      const ws = new PerpsWsClient(createClient())
      const listener = vi.fn()
      const sub = { channel: 'prices' as const, dex: 'hyperliquid' }

      await ws.subscribe(sub, listener)

      expect(mockSubscribe).toHaveBeenCalledWith(sub, listener)

      ws.close()
    })

    it('should return unsubscribe function from provider', async () => {
      useWsUrlHandler()
      const mockUnsub = vi.fn()
      mockSubscribe.mockResolvedValueOnce(mockUnsub)

      const ws = new PerpsWsClient(createClient())
      const unsub = await ws.subscribe(
        { channel: 'prices', dex: 'hyperliquid' },
        vi.fn()
      )

      expect(unsub).toBe(mockUnsub)

      ws.close()
    })

    it('should throw when provider has no WebSocket URL', async () => {
      // Default mock dexes have no wsUrl
      const ws = new PerpsWsClient(createClient())

      await expect(
        ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())
      ).rejects.toThrow('No WebSocket URL found for provider: hyperliquid')

      ws.close()
    })

    it('should throw for unknown provider', async () => {
      useWsUrlHandler()
      const ws = new PerpsWsClient(createClient())

      await expect(
        ws.subscribe({ channel: 'prices', dex: 'unknown-provider' }, vi.fn())
      ).rejects.toThrow('No WebSocket URL found for provider: unknown-provider')

      ws.close()
    })

    it('should handle concurrent subscribes for same provider without race', async () => {
      useWsUrlHandler()
      const ws = new PerpsWsClient(createClient())

      // Fire off two subscribes concurrently
      const [_unsub1, _unsub2] = await Promise.all([
        ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn()),
        ws.subscribe(
          { channel: 'orderbook', dex: 'hyperliquid', symbol: 'BTC' },
          vi.fn()
        ),
      ])

      // Should only create one provider despite concurrent calls
      expect(MockedHlProvider).toHaveBeenCalledOnce()

      ws.close()
    })
  })

  describe('close', () => {
    it('should close all providers', async () => {
      useWsUrlHandler()
      const ws = new PerpsWsClient(createClient())

      await ws.subscribe({ channel: 'prices', dex: 'hyperliquid' }, vi.fn())

      ws.close()

      expect(mockClose).toHaveBeenCalledOnce()
    })

    it('should be safe to call close with no providers', () => {
      const ws = new PerpsWsClient(createClient())
      expect(() => ws.close()).not.toThrow()
    })
  })
})
