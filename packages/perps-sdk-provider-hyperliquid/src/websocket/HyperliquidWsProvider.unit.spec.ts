import {
  createPerpsClient,
  WS_CHANNEL_TEARDOWN_LINGER_MS,
  wsLog,
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

const assetPositionOf = (coin: string) => ({
  position: {
    coin,
    szi: '0.1',
    entryPx: '94000',
    positionValue: '9500',
    liquidationPx: '85000',
    unrealizedPnl: '100',
    marginUsed: '940',
    leverage: { type: 'cross', value: 10 },
  },
})

const allDexsFrame = (user: string, states: Array<[string, string[]]>) =>
  JSON.stringify({
    channel: 'allDexsClearinghouseState',
    data: {
      user,
      clearinghouseStates: states.map(([dex, coins]) => [
        dex,
        { assetPositions: coins.map(assetPositionOf) },
      ]),
    },
  })

const flushMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0))

const indexedPerpCtx = (midPx: string) => ({
  funding: '0.0001',
  openInterest: '100',
  dayNtlVlm: '1000000',
  prevDayPx: midPx,
  markPx: midPx,
  midPx,
  oraclePx: midPx,
})

const perpCtx = (coin: string, midPx: string) => ({
  coin,
  ...indexedPerpCtx(midPx),
})

// Seed the provider's live perp mids by replaying an `allDexsAssetCtxs` frame,
// so reference-price lookups resolve.
const seedMids = (mids: Record<string, string>) =>
  getMockRwsInstance().simulateMessage(
    JSON.stringify({
      channel: 'allDexsAssetCtxs',
      data: {
        assetCtxs: [
          ['', Object.entries(mids).map(([coin, mid]) => perpCtx(coin, mid))],
        ],
      },
    })
  )

// Encode a compressed payload the way HL does: base64 + raw DEFLATE.
const encodeCompressed = async (payload: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'))
  const buf = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  for (const b of buf) {
    bin += String.fromCharCode(b)
  }
  return btoa(bin)
}

// Seed mid/mark via a `fastAssetCtxs` frame. The provider decodes the payload
// off the microtask/threadpool queue; await lets that settle before asserting.
const seedFast = async (
  ctxs: Record<string, { markPx?: string; midPx?: string | null }>
) => {
  const data = await encodeCompressed(ctxs)
  getMockRwsInstance().simulateMessage(
    JSON.stringify({ channel: 'fastAssetCtxs', data })
  )
  await new Promise((resolve) => setTimeout(resolve, 10))
}

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
    options: unknown

    constructor(_url?: string, options?: unknown) {
      this.options = options
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

    // Mirrors ReconnectingWebSocket.ready(): terminal 'disconnected' rejects.
    ready() {
      if (this.status === 'disconnected') {
        return Promise.reject(
          new Error('WebSocket max reconnect attempts reached')
        )
      }
      return Promise.resolve()
    }

    close() {
      this.closed = true
    }

    reconnect() {
      this.simulateStatus('reconnecting')
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

vi.mock('@lifi/perps-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lifi/perps-sdk')>()
  return {
    ...actual,
    ReconnectingWebSocket: MockRws,
  }
})

// The market registry fetches `${apiUrl}/markets` over HTTP — serve it here.
const marketsFetchMock = vi.fn()

const marketsFailureResponse = () =>
  new Response(JSON.stringify({ code: 1, message: 'markets fetch failed' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })

vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
  const url = input.toString()
  if (!url.includes('/markets')) {
    throw new Error(`Unexpected fetch: ${url}`)
  }
  const result = await marketsFetchMock()
  return result instanceof Response
    ? result
    : new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
})

// --- Test setup ---

const providerKey = 'hyperliquid'

function createProvider(): HyperliquidWsProvider {
  return new HyperliquidWsProvider('wss://api.hyperliquid.xyz/ws', providerKey)
}

// Fresh client per provider: the market registry is cached per (client, provider).
const freshClient = () =>
  createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })

/** Provider whose market registry is served `markets`. */
function createEnrichingProvider(
  markets = [...HL_MARKETS, HL_SPOT_MARKET]
): HyperliquidWsProvider {
  marketsFetchMock.mockResolvedValue({ markets })
  return new HyperliquidWsProvider(
    'wss://api.hyperliquid.xyz/ws',
    providerKey,
    freshClient()
  )
}

describe('HyperliquidWsProvider', () => {
  describe('keepalive framing', () => {
    it('configures the socket keepalive with the Hyperliquid ping frame', () => {
      createProvider()
      expect(getMockRwsInstance().options).toEqual({
        pingPayload: '{"method":"ping"}',
      })
    })
  })

  describe('subscribe', () => {
    it('subscribes to pac, sac, and the fastAssetCtxs feed', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      expect(getMockRwsInstance().sent).toHaveLength(3)
      const payloads = getMockRwsInstance().sent.map((s) => JSON.parse(s))
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: { type: 'pac' },
      })
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: { type: 'sac' },
      })
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: { type: 'fastAssetCtxs' },
      })
    })

    it('maps marketContext subscription to activeAssetCtx payload', async () => {
      const provider = createProvider()

      await provider.subscribe(
        { channel: 'marketContext', dex: 'hyperliquid', marketId: 'BTC' },
        vi.fn()
      )

      expect(JSON.parse(getMockRwsInstance().sent[0])).toEqual({
        method: 'subscribe',
        subscription: { type: 'activeAssetCtx', coin: 'BTC' },
      })
    })

    it('auto-heals subscribe after reconnect exhaustion and stays recoverable', async () => {
      const provider = createProvider()
      getMockRwsInstance().simulateStatus('disconnected')

      const firstUnsub = await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )
      expect(typeof firstUnsub).toBe('function')
      expect(getMockRwsInstance().status).toBe('reconnecting')

      // Repeated terminal drops remain recoverable via subscribe intent.
      getMockRwsInstance().simulateStatus('disconnected')
      const secondUnsub = await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )
      expect(typeof secondUnsub).toBe('function')
    })

    it('should return an unsubscribe function', async () => {
      const provider = createProvider()
      const unsub = await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )

      expect(typeof unsub).toBe('function')
    })

    it('unsubscribes all marketsContext wire feeds when the listener unsubscribes', async () => {
      vi.useFakeTimers()
      try {
        const provider = createProvider()

        const unsub = await provider.subscribe(
          { channel: 'marketsContext', dex: 'hyperliquid' },
          vi.fn()
        )

        getMockRwsInstance().sent = [] // Clear subscribe messages.
        unsub()
        vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS) // fire the deferred teardown

        expect(getMockRwsInstance().sent).toHaveLength(3)
        const unsubPayloads = getMockRwsInstance().sent.map((s) =>
          JSON.parse(s)
        )
        expect(unsubPayloads).toContainEqual({
          method: 'unsubscribe',
          subscription: { type: 'pac' },
        })
        expect(unsubPayloads).toContainEqual({
          method: 'unsubscribe',
          subscription: { type: 'sac' },
        })
        expect(unsubPayloads).toContainEqual({
          method: 'unsubscribe',
          subscription: { type: 'fastAssetCtxs' },
        })
      } finally {
        vi.useRealTimers()
      }
    })

    it('subscribes to the compact l2 orderbook stream', async () => {
      const provider = createProvider()

      await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        vi.fn()
      )

      const payloads = getMockRwsInstance().sent.map((s) => JSON.parse(s))
      expect(payloads).toEqual([
        {
          method: 'subscribe',
          subscription: { type: 'l2', c: 'BTC', s: null, m: null },
        },
      ])
    })

    it('dedupes orderbook steps that collapse to the same l2 payload', async () => {
      vi.useFakeTimers()
      try {
        const provider = createProvider()

        const unsubFine = await provider.subscribe(
          {
            channel: 'orderbook',
            dex: 'hyperliquid',
            marketId: 'BTC',
            priceStep: 0.1,
          },
          vi.fn()
        )
        const unsubCoarser = await provider.subscribe(
          {
            channel: 'orderbook',
            dex: 'hyperliquid',
            marketId: 'BTC',
            priceStep: 1,
          },
          vi.fn()
        )

        expect(getMockRwsInstance().sent.map((s) => JSON.parse(s))).toEqual([
          {
            method: 'subscribe',
            subscription: { type: 'l2', c: 'BTC', s: null, m: null },
          },
        ])

        getMockRwsInstance().sent = []
        unsubFine()
        vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS)
        expect(getMockRwsInstance().sent).toEqual([])

        unsubCoarser()
        vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS)
        expect(getMockRwsInstance().sent.map((s) => JSON.parse(s))).toEqual([
          {
            method: 'unsubscribe',
            subscription: { type: 'l2', c: 'BTC', s: null, m: null },
          },
        ])
      } finally {
        vi.useRealTimers()
      }
    })

    it('unsubscribes the compact l2 orderbook stream', async () => {
      vi.useFakeTimers()
      try {
        const provider = createProvider()
        const unsub = await provider.subscribe(
          { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
          vi.fn()
        )

        getMockRwsInstance().sent = []
        unsub()
        vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS)

        const payloads = getMockRwsInstance().sent.map((s) => JSON.parse(s))
        expect(payloads).toEqual([
          {
            method: 'unsubscribe',
            subscription: { type: 'l2', c: 'BTC', s: null, m: null },
          },
        ])
      } finally {
        vi.useRealTimers()
      }
    })

    it('maps priceStep onto compact l2 significant figures against the live mid', async () => {
      // BTC mid 95000: floor(log10) = 4, step 10 → nSigFigs 4.
      const provider = createEnrichingProvider()
      seedMids({ BTC: '95000' })

      await provider.subscribe(
        {
          channel: 'orderbook',
          dex: 'hyperliquid',
          marketId: 'BTC',
          depth: 30,
          priceStep: 10,
        },
        vi.fn()
      )

      const subscription = JSON.parse(getMockRwsInstance().sent[0]).subscription
      expect(subscription).toEqual({
        type: 'l2',
        c: 'BTC',
        s: 4,
        m: null,
      })
      expect(subscription).not.toHaveProperty('nLevels')
      expect(subscription).not.toHaveProperty('priceStep')
    })

    it('reopens the orderbook wire subscription when priceStep changes', async () => {
      vi.useFakeTimers()
      try {
        const provider = createEnrichingProvider()
        seedMids({ BTC: '95000' })

        const unsub = await provider.subscribe(
          {
            channel: 'orderbook',
            dex: 'hyperliquid',
            marketId: 'BTC',
            priceStep: 1,
          },
          vi.fn()
        )

        getMockRwsInstance().sent = []
        unsub()

        await provider.subscribe(
          {
            channel: 'orderbook',
            dex: 'hyperliquid',
            marketId: 'BTC',
            priceStep: 10,
          },
          vi.fn()
        )

        const payloads = getMockRwsInstance().sent.map((s) => JSON.parse(s))
        expect(payloads).toEqual([
          {
            method: 'unsubscribe',
            subscription: {
              type: 'l2',
              c: 'BTC',
              s: 5,
              m: null,
            },
          },
          {
            method: 'subscribe',
            subscription: {
              type: 'l2',
              c: 'BTC',
              s: 4,
              m: null,
            },
          },
        ])
      } finally {
        vi.useRealTimers()
      }
    })

    it('emits mantissa for a non-power-of-ten priceStep at the 5-sig-fig boundary', async () => {
      // BTC mid 95000: step 2 → nSigFigs 5, mantissa 2.
      const provider = createEnrichingProvider()
      seedMids({ BTC: '95000' })

      await provider.subscribe(
        {
          channel: 'orderbook',
          dex: 'hyperliquid',
          marketId: 'BTC',
          priceStep: 2,
        },
        vi.fn()
      )

      expect(JSON.parse(getMockRwsInstance().sent[0]).subscription).toEqual({
        type: 'l2',
        c: 'BTC',
        s: 5,
        m: 2,
      })
    })

    it('requests full precision when the priceStep is finer than HL resolves', async () => {
      // BTC mid 95000: step 0.1 needs 6 sig figs, beyond HL's max of 5.
      const provider = createEnrichingProvider()
      seedMids({ BTC: '95000' })

      await provider.subscribe(
        {
          channel: 'orderbook',
          dex: 'hyperliquid',
          marketId: 'BTC',
          priceStep: 0.1,
        },
        vi.fn()
      )

      expect(JSON.parse(getMockRwsInstance().sent[0]).subscription).toEqual({
        type: 'l2',
        c: 'BTC',
        s: null,
        m: null,
      })
    })

    it('uses the latest book mid to aggregate when market context is unavailable', async () => {
      const provider = createProvider()
      const unsub = await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        vi.fn()
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'l2',
          data: {
            s: {
              coin: 'BTC',
              levels: [
                [{ px: '62500', sz: '1', n: 1 }],
                [{ px: '62600', sz: '1', n: 1 }],
              ],
              time: 1704067200000,
            },
          },
        })
      )

      getMockRwsInstance().sent = []
      unsub()
      await provider.subscribe(
        {
          channel: 'orderbook',
          dex: 'hyperliquid',
          marketId: 'BTC',
          priceStep: 100,
        },
        vi.fn()
      )

      expect(JSON.parse(getMockRwsInstance().sent.at(-1) ?? '{}')).toEqual({
        method: 'subscribe',
        subscription: {
          type: 'l2',
          c: 'BTC',
          s: 3,
          m: null,
        },
      })
    })

    it('requests full precision when no live mid is available for the market', async () => {
      // No fastAssetCtxs frame received → no reference magnitude.
      const provider = createProvider()

      await provider.subscribe(
        {
          channel: 'orderbook',
          dex: 'hyperliquid',
          marketId: 'BTC',
          priceStep: 10,
        },
        vi.fn()
      )

      expect(JSON.parse(getMockRwsInstance().sent[0]).subscription).toEqual({
        type: 'l2',
        c: 'BTC',
        s: null,
        m: null,
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

    it('should map trades subscription to trades payload', async () => {
      const provider = createProvider()

      await provider.subscribe(
        { channel: 'trades', dex: 'hyperliquid', marketId: 'BTC' },
        vi.fn()
      )

      expect(JSON.parse(getMockRwsInstance().sent[0])).toEqual({
        method: 'subscribe',
        subscription: { type: 'trades', coin: 'BTC' },
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

    it('rejects a second orderUpdates subscribe for a different address while the first is live', async () => {
      const provider = createEnrichingProvider()
      const listenerA = vi.fn()
      const listenerB = vi.fn()

      await provider.subscribe(
        { channel: 'orderUpdates', dex: 'hyperliquid', address: '0xaaa' },
        listenerA
      )

      await expect(
        provider.subscribe(
          { channel: 'orderUpdates', dex: 'hyperliquid', address: '0xbbb' },
          listenerB
        )
      ).rejects.toThrow(/one orderUpdates address/)

      // No wire subscribe for the rejected address.
      const payloads = getMockRwsInstance().sent.map((s) => JSON.parse(s))
      expect(payloads).not.toContainEqual({
        method: 'subscribe',
        subscription: { type: 'orderUpdates', user: '0xbbb' },
      })

      // Frames keep flowing to the active subscriber only.
      getMockRwsInstance().simulateMessage(
        JSON.stringify({ channel: 'orderUpdates', data: [] })
      )
      expect(listenerA).toHaveBeenCalledOnce()
      expect(listenerB).not.toHaveBeenCalled()
    })

    it('rejects a conflicting orderUpdates subscribe even while the first open is still in flight', async () => {
      const provider = createEnrichingProvider()

      const subA = provider.subscribe(
        { channel: 'orderUpdates', dex: 'hyperliquid', address: '0xaaa' },
        vi.fn()
      )
      const subB = provider.subscribe(
        { channel: 'orderUpdates', dex: 'hyperliquid', address: '0xbbb' },
        vi.fn()
      )

      await expect(subB).rejects.toThrow(/one orderUpdates address/)
      await expect(subA).resolves.toBeTypeOf('function')
    })

    it('shares one orderUpdates channel across listeners for the same address regardless of casing', async () => {
      const provider = createEnrichingProvider()
      const listenerA = vi.fn()
      const listenerB = vi.fn()

      await provider.subscribe(
        { channel: 'orderUpdates', dex: 'hyperliquid', address: '0xAAA' },
        listenerA
      )
      await provider.subscribe(
        { channel: 'orderUpdates', dex: 'hyperliquid', address: '0xaaa' },
        listenerB
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({ channel: 'orderUpdates', data: [] })
      )
      expect(listenerA).toHaveBeenCalledOnce()
      expect(listenerB).toHaveBeenCalledOnce()
    })

    it('expires a lingering orderUpdates channel so an address switch within the linger succeeds', async () => {
      vi.useFakeTimers()
      try {
        const provider = createEnrichingProvider()
        const listenerA = vi.fn()
        const listenerB = vi.fn()

        const unsubA = await provider.subscribe(
          { channel: 'orderUpdates', dex: 'hyperliquid', address: '0xaaa' },
          listenerA
        )
        unsubA() // teardown deferred by the linger window
        getMockRwsInstance().sent = []

        await provider.subscribe(
          { channel: 'orderUpdates', dex: 'hyperliquid', address: '0xbbb' },
          listenerB
        )

        const payloads = getMockRwsInstance().sent.map((s) => JSON.parse(s))
        expect(payloads).toEqual([
          {
            method: 'unsubscribe',
            subscription: { type: 'orderUpdates', user: '0xaaa' },
          },
          {
            method: 'subscribe',
            subscription: { type: 'orderUpdates', user: '0xbbb' },
          },
        ])

        // The expired channel's linger timer must not fire a second teardown.
        getMockRwsInstance().sent = []
        vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS * 2)
        expect(getMockRwsInstance().sent).toHaveLength(0)

        getMockRwsInstance().simulateMessage(
          JSON.stringify({ channel: 'orderUpdates', data: [] })
        )
        expect(listenerA).not.toHaveBeenCalled()
        expect(listenerB).toHaveBeenCalledOnce()
      } finally {
        vi.useRealTimers()
      }
    })

    it('allows a different orderUpdates address after the previous channel fully tore down', async () => {
      vi.useFakeTimers()
      try {
        const provider = createEnrichingProvider()
        const listenerB = vi.fn()

        const unsubA = await provider.subscribe(
          { channel: 'orderUpdates', dex: 'hyperliquid', address: '0xaaa' },
          vi.fn()
        )
        unsubA()
        vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS)

        await provider.subscribe(
          { channel: 'orderUpdates', dex: 'hyperliquid', address: '0xbbb' },
          listenerB
        )

        getMockRwsInstance().simulateMessage(
          JSON.stringify({ channel: 'orderUpdates', data: [] })
        )
        expect(listenerB).toHaveBeenCalledOnce()
      } finally {
        vi.useRealTimers()
      }
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

    it('retries the markets fetch on the next subscribe after a transient failure', async () => {
      marketsFetchMock.mockReset()
      marketsFetchMock
        .mockResolvedValueOnce(marketsFailureResponse())
        .mockResolvedValue({ markets: [...HL_MARKETS, XYZ_BRENTOIL_MARKET] })
      const provider = new HyperliquidWsProvider(
        'wss://api.hyperliquid.xyz/ws',
        providerKey,
        freshClient()
      )

      await expect(
        provider.subscribe(
          { channel: 'positions', dex: 'hyperliquid', address: '0xuser1' },
          vi.fn()
        )
      ).rejects.toThrow('markets fetch failed')

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

      expect(marketsFetchMock).toHaveBeenCalledTimes(2)
      expect(listener).toHaveBeenCalledOnce()
      expect(listener.mock.calls[0][0].data[0]).toMatchObject({
        market: { id: 'BTC' },
        size: '0.1',
      })
    })
  })

  describe('message handling', () => {
    it('emits marketsContext with oracle/mark/mid for the allDexsAssetCtxs feed', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allDexsAssetCtxs',
          data: {
            assetCtxs: [
              [
                '',
                [
                  {
                    coin: 'BTC',
                    funding: '0.0001',
                    openInterest: '100',
                    dayNtlVlm: '1000000',
                    prevDayPx: '94000',
                    markPx: '95000',
                    midPx: '95001',
                    oraclePx: '94998',
                  },
                ],
              ],
            ],
          },
        })
      )

      const event = listener.mock.calls.at(-1)?.[0]
      expect(event.channel).toBe('marketsContext')
      expect(event.data.BTC).toMatchObject({
        marketId: 'BTC',
        midPrice: '95001',
        markPrice: '95000',
        oraclePrice: '94998',
      })
    })

    it('emits marketContext with oracle/mark/funding/volume from activeAssetCtx', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketContext', dex: 'hyperliquid', marketId: 'BTC' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'activeAssetCtx',
          data: {
            coin: 'BTC',
            ctx: {
              funding: 0.0001,
              openInterest: 100,
              dayNtlVlm: 1000000,
              prevDayPx: 94000,
              markPx: 95000,
              midPx: 95001,
              oraclePx: 94998,
            },
          },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      expect(listener.mock.calls[0][0]).toMatchObject({
        channel: 'marketContext',
        data: {
          marketId: 'BTC',
          midPrice: '95001',
          markPrice: '95000',
          oraclePrice: '94998',
          volume24h: '1000000',
          funding: { rate: '0.0001' },
        },
      })
    })

    it('emits marketContext from activeAssetCtx when midPx is omitted', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketContext', dex: 'hyperliquid', marketId: 'BTC' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'activeAssetCtx',
          data: {
            coin: 'BTC',
            ctx: {
              funding: 0.0001,
              openInterest: 100,
              dayNtlVlm: 1000000,
              prevDayPx: 94000,
              markPx: 95000,
              oraclePx: 94998,
            },
          },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      expect(listener.mock.calls[0][0].data).toMatchObject({
        marketId: 'BTC',
        midPrice: '95000',
        markPrice: '95000',
        oraclePrice: '94998',
      })
    })

    it('emits marketContext from activeSpotAssetCtx', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        {
          channel: 'marketContext',
          dex: 'hyperliquid',
          marketId: 'PURR/USDC',
        },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'activeSpotAssetCtx',
          data: {
            coin: 'PURR/USDC',
            ctx: {
              prevDayPx: '0.09',
              dayNtlVlm: '1234567.89',
              markPx: '0.1',
              midPx: '0.11',
              circulatingSupply: '590000000000000.123456',
            },
          },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      expect(listener.mock.calls[0][0]).toMatchObject({
        channel: 'marketContext',
        data: {
          marketId: 'PURR/USDC',
          midPrice: '0.11',
          markPrice: '0.1',
          prevDayPrice: '0.09',
          volume24h: '1234567.89',
          marketCap: '59000000000000.0123456',
        },
      })
      expect(listener.mock.calls[0][0].data.openInterest).toBeUndefined()
      expect(listener.mock.calls[0][0].data.funding).toBeUndefined()
    })

    it('logs and drops activeAssetCtx snapshots with missing required fields', async () => {
      const provider = createProvider()
      const listener = vi.fn()
      const parseFailure = vi
        .spyOn(wsLog, 'parseFailure')
        .mockImplementation(() => {})

      await provider.subscribe(
        { channel: 'marketContext', dex: 'hyperliquid', marketId: 'BTC' },
        listener
      )

      const raw = JSON.stringify({
        channel: 'activeAssetCtx',
        data: {
          coin: 'BTC',
          ctx: {
            funding: 0.0001,
            openInterest: 100,
            dayNtlVlm: 1000000,
            prevDayPx: 94000,
            midPx: 95001,
            oraclePx: 94998,
          },
        },
      })
      getMockRwsInstance().simulateMessage(raw)

      expect(listener).not.toHaveBeenCalled()
      expect(parseFailure).toHaveBeenCalledWith(providerKey, raw)
      parseFailure.mockRestore()
    })

    it('ignores unkeyed allDexsAssetCtxs ctxs entries', async () => {
      const provider = createEnrichingProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allDexsAssetCtxs',
          data: {
            ctxs: [['', [indexedPerpCtx('95001'), indexedPerpCtx('3401')]]],
          },
        })
      )

      const event = listener.mock.calls.at(-1)?.[0]
      expect(event.channel).toBe('marketsContext')
      expect(event.data).toEqual({})
    })

    it('emits perp context from compressed pac and merges partial updates', async () => {
      const provider = createEnrichingProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'pac',
          data: await encodeCompressed([
            ['', [perpCtx('BTC', '95001'), perpCtx('ETH', '3401')]],
          ]),
        })
      )

      await vi.waitFor(() => {
        const event = listener.mock.calls.at(-1)?.[0]
        expect(event.data.BTC).toMatchObject({
          marketId: 'BTC',
          midPrice: '95001',
          prevDayPrice: '95001',
          openInterest: '100',
        })
      })

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'pac',
          data: await encodeCompressed([
            [
              '',
              [
                { coin: 'BTC', markPx: '95100', midPx: '95101' },
                { coin: 'ETH', midPx: '3410' },
              ],
            ],
          ]),
        })
      )

      await vi.waitFor(() => {
        const event = listener.mock.calls.at(-1)?.[0]
        expect(event.data.BTC).toMatchObject({
          marketId: 'BTC',
          midPrice: '95101',
          markPrice: '95100',
          prevDayPrice: '95001',
          openInterest: '100',
        })
        expect(event.data.ETH).toMatchObject({
          marketId: 'ETH',
          midPrice: '3410',
          markPrice: '3401',
        })
      })
    })

    it('does not assign unkeyed compressed pac entries by registry order', async () => {
      const provider = createEnrichingProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'pac',
          data: await encodeCompressed([
            ['', [indexedPerpCtx('0.000392'), indexedPerpCtx('13.339')]],
          ]),
        })
      )

      await vi.waitFor(() => {
        const event = listener.mock.calls.at(-1)?.[0]
        expect(event.data).toEqual({})
      })
    })

    it('emits known spot context from compressed sac and ignores unknown keys', async () => {
      const spotMarket: Market = {
        ...HL_SPOT_MARKET,
        id: 'PURR/USDC',
        baseAsset: {
          ...HL_SPOT_MARKET.baseAsset,
          id: '142',
          displaySymbol: 'PURR',
        },
      }
      const provider = createEnrichingProvider([...HL_MARKETS, spotMarket])
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'sac',
          data: await encodeCompressed({
            PURR: {
              prevDayPx: '1',
              dayNtlVlm: '2',
              markPx: '3',
              midPx: '4',
            },
            '@142': {
              prevDayPx: '1',
              dayNtlVlm: '2',
              markPx: '3',
              midPx: '4',
            },
            'PURR/USDC': {
              prevDayPx: '0.09',
              dayNtlVlm: '1234567.89',
              markPx: '0.1',
              midPx: '0.1',
              dayBaseVlm: '13',
              circulatingSupply: '590000000000000.123456',
            },
            '#999': {
              prevDayPx: '1',
              dayNtlVlm: '2',
              markPx: '3',
              midPx: '4',
            },
          }),
        })
      )

      await vi.waitFor(() => {
        const event = listener.mock.calls.at(-1)?.[0]
        expect(event.data['PURR/USDC']).toMatchObject({
          marketId: 'PURR/USDC',
          midPrice: '0.1',
          markPrice: '0.1',
          prevDayPrice: '0.09',
          volume24h: '1234567.89',
          marketCap: '59000000000000.0123456',
        })
        expect(event.data['PURR/USDC'].openInterest).toBeUndefined()
        expect(event.data['#999']).toBeUndefined()
      })

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'sac',
          data: await encodeCompressed({
            'PURR/USDC': { dayNtlVlm: '1235000' },
          }),
        })
      )

      await vi.waitFor(() => {
        const event = listener.mock.calls.at(-1)?.[0]
        expect(event.data['PURR/USDC']).toMatchObject({
          midPrice: '0.1',
          markPrice: '0.1',
          prevDayPrice: '0.09',
          volume24h: '1235000',
          marketCap: '59000000000000.0123456',
        })
      })
    })

    it('merges perp asset contexts across sub-dexs into the marketsContext map', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allDexsAssetCtxs',
          data: {
            assetCtxs: [
              [
                '',
                [
                  {
                    coin: 'BTC',
                    funding: '0.0001',
                    openInterest: '100',
                    dayNtlVlm: '1',
                    prevDayPx: '94000',
                    markPx: '95000',
                    midPx: '95001',
                    oraclePx: '94998',
                  },
                ],
              ],
              [
                'xyz',
                [
                  {
                    coin: 'xyz:BRENTOIL',
                    funding: '0.0002',
                    openInterest: '50',
                    dayNtlVlm: '2',
                    prevDayPx: '70',
                    markPx: '70.50',
                    midPx: '70.49',
                    oraclePx: '70.48',
                  },
                ],
              ],
            ],
          },
        })
      )

      const event = listener.mock.calls.at(-1)?.[0]
      expect(Object.keys(event.data).sort()).toEqual(['BTC', 'xyz:BRENTOIL'])
      expect(event.data['xyz:BRENTOIL'].midPrice).toBe('70.49')
    })

    it('overlays fastAssetCtxs mid+mark onto a perp without clearing oracle/metadata', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'allDexsAssetCtxs',
          data: {
            assetCtxs: [
              [
                '',
                [
                  {
                    coin: 'BTC',
                    funding: '0.0001',
                    openInterest: '100',
                    dayNtlVlm: '1000000',
                    prevDayPx: '94000',
                    markPx: '95000',
                    midPx: '95001',
                    oraclePx: '94998',
                  },
                ],
              ],
            ],
          },
        })
      )

      // A later fastAssetCtxs frame updates mid + mark; the rarer asset-context
      // feed's oracle/metadata must persist (field-level last-write-wins).
      await seedFast({ BTC: { midPx: '95500', markPx: '95480' } })

      await vi.waitFor(() => {
        const event = listener.mock.calls.at(-1)?.[0]
        expect(event.data.BTC).toMatchObject({
          marketId: 'BTC',
          midPrice: '95500',
          markPrice: '95480',
          oraclePrice: '94998',
          openInterest: '100',
        })
      })
    })

    it('emits a perp mid+mark from fastAssetCtxs with no allDexsAssetCtxs frame', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      // No allDexsAssetCtxs frame at all (HL's aggregate feed is idle); the
      // high-frequency fastAssetCtxs feed alone drives mid + mark.
      await seedFast({ ETH: { midPx: '3400', markPx: '3401' } })
      await seedFast({ ETH: { midPx: '3411', markPx: '3412' } })

      await vi.waitFor(() => {
        const event = listener.mock.calls.at(-1)?.[0]
        expect(event.channel).toBe('marketsContext')
        expect(event.data.ETH).toEqual({
          marketId: 'ETH',
          midPrice: '3411',
          markPrice: '3412',
        })
      })
    })

    it('updates a builder/sub-dex coin and merges incremental frames', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      await seedFast({
        BTC: { midPx: '95000', markPx: '95001' },
        'xyz:NVDA': { midPx: '145.2', markPx: '145.3' },
      })
      // Incremental frame: only BTC changes; xyz:NVDA must persist, and BTC's
      // mark (absent from this frame) keeps its prior value.
      await seedFast({ BTC: { midPx: '95500' } })

      await vi.waitFor(() => {
        const event = listener.mock.calls.at(-1)?.[0]
        expect(event.data.BTC).toEqual({
          marketId: 'BTC',
          midPrice: '95500',
          markPrice: '95001',
        })
        expect(event.data['xyz:NVDA']).toEqual({
          marketId: 'xyz:NVDA',
          midPrice: '145.2',
          markPrice: '145.3',
        })
      })
    })

    it('emits orderbook event for compact l2 snapshot frames', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'l2',
          data: {
            s: {
              coin: 'BTC',
              levels: [
                [{ px: '94999', sz: '1.5', n: 3 }],
                [{ px: '95001', sz: '1.0', n: 2 }],
              ],
              time: 1704067200000,
            },
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

    it('applies compressed l2 deltas to the latest snapshot', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'l2',
          data: {
            s: {
              coin: 'BTC',
              levels: [
                [
                  { px: '95000', sz: '1.0', n: 1 },
                  { px: '94990', sz: '2.0', n: 1 },
                  { px: '94980', sz: '3.0', n: 1 },
                ],
                [
                  { px: '95010', sz: '1.5', n: 1 },
                  { px: '95020', sz: '2.5', n: 1 },
                ],
              ],
              time: 1704067200000,
            },
          },
        })
      )
      const compressed = await encodeCompressed({
        c: 'BTC',
        t: 1704067200500,
        l: [
          [
            { p: '95000', s: '1.1' },
            { p: '94995', s: '0.4' },
          ],
          [{ p: '95010', s: '0' }],
        ],
        r: [['94980'], []],
      })
      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'l2',
          data: { c: compressed },
        })
      )
      await new Promise((resolve) => setTimeout(resolve, 10))

      const event = listener.mock.calls.at(-1)?.[0]
      expect(event).toEqual({
        channel: 'orderbook',
        data: {
          provider: 'hyperliquid',
          marketId: 'BTC',
          bids: [
            { price: '95000', size: '1.1' },
            { price: '94995', size: '0.4' },
            { price: '94990', size: '2.0' },
          ],
          asks: [{ price: '95020', size: '2.5' }],
          timestamp: 1704067200500,
        },
      })
    })

    it('applies uncompressed l2 update frames with index removals', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'STX' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'l2',
          data: {
            s: {
              coin: 'STX',
              levels: [
                [
                  { px: '0.17698', sz: '9142.2', n: 1 },
                  { px: '0.1769', sz: '100', n: 1 },
                ],
                [
                  { px: '0.1772', sz: '505.9', n: 1 },
                  { px: '0.17721', sz: '9049.3', n: 1 },
                  { px: '0.17811', sz: '3548.9', n: 1 },
                ],
              ],
              time: 1782230105000,
            },
          },
        })
      )
      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'l2',
          data: {
            u: {
              c: 'STX',
              t: 1782230105876,
              l: [
                [],
                [
                  { p: '0.1772', s: '600' },
                  { p: '0.17811', s: '3000' },
                ],
              ],
              r: [[], [1]],
              s: '0.00015',
            },
          },
        })
      )

      const event = listener.mock.calls.at(-1)?.[0]
      expect(event).toEqual({
        channel: 'orderbook',
        data: {
          provider: 'hyperliquid',
          marketId: 'STX',
          bids: [
            { price: '0.17698', size: '9142.2' },
            { price: '0.1769', size: '100' },
          ],
          asks: [
            { price: '0.1772', size: '600' },
            { price: '0.17811', size: '3000' },
          ],
          timestamp: 1782230105876,
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
          channel: 'l2',
          data: {
            s: { coin: 'BTC', levels: [side, side], time: 1704067200000 },
          },
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

    it('emits public trades for the subscribed market', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'trades', dex: 'hyperliquid', marketId: 'BTC' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'trades',
          data: [
            {
              coin: 'BTC',
              side: 'B',
              px: '94000',
              sz: '0.1',
              time: 1704067200000,
              tid: 123,
            },
          ],
        })
      )

      expect(listener).toHaveBeenCalledWith({
        channel: 'trades',
        data: [
          {
            provider: 'hyperliquid',
            marketId: 'BTC',
            price: '94000',
            size: '0.1',
            timestamp: 1704067200000,
            side: 'buy',
            id: '123',
          },
        ],
      })
    })

    it('should emit orderUpdates event to the subscribed address listener', async () => {
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

    it('evicts a siblingFilledCanceled TP/SL leg into terminated instead of re-emitting it as active', async () => {
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
                oid: 200,
                coin: 'BTC',
                side: 'A',
                sz: '0.05',
                limitPx: '0',
                orderType: 'Stop Market',
                origSz: '0.05',
                reduceOnly: true,
                timestamp: 1704067200000,
                tif: null,
                cloid: null,
                triggerCondition: 'Stop Loss',
                triggerPx: '90000',
              },
              status: 'siblingFilledCanceled',
              statusTimestamp: 1704067201000,
            },
          ],
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.data.openOrders).toHaveLength(0)
      expect(event.data.triggerOrders).toHaveLength(0)
      expect(event.data.terminated).toEqual(['200'])
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

    it('suppresses the isSnapshot history and emits only the subsequent live fill', async () => {
      const provider = createEnrichingProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'fills', dex: 'hyperliquid', address: '0xuser1' },
        listener
      )

      const historical = (tid: number) => ({
        tid,
        coin: 'BTC',
        side: 'B',
        px: '90000',
        sz: '0.1',
        dir: 'Open Long',
        fee: '4.50',
        closedPnl: '0',
        time: 1704067200000,
        startPosition: '0.0',
      })

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'userFills',
          data: {
            isSnapshot: true,
            user: '0xuser1',
            fills: [historical(1), historical(2), historical(3)],
          },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      expect(listener.mock.calls[0][0]).toMatchObject({
        channel: 'fills',
        data: [],
      })

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'userFills',
          data: {
            isSnapshot: false,
            user: '0xuser1',
            fills: [{ ...historical(999), px: '94000' }],
          },
        })
      )

      expect(listener).toHaveBeenCalledTimes(2)
      const live = listener.mock.calls[1][0]
      expect(live.data).toHaveLength(1)
      expect(live.data[0]).toMatchObject({ id: '999', price: '94000' })
    })

    it('does not re-emit snapshot fills when a reconnect replays the subscription', async () => {
      const provider = createEnrichingProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'fills', dex: 'hyperliquid', address: '0xuser1' },
        listener
      )

      const snapshotFrame = JSON.stringify({
        channel: 'userFills',
        data: {
          isSnapshot: true,
          user: '0xuser1',
          fills: [
            {
              tid: 42,
              coin: 'BTC',
              side: 'B',
              px: '90000',
              sz: '0.1',
              dir: 'Open Long',
              fee: '4.50',
              closedPnl: '0',
              time: 1704067200000,
              startPosition: '0.0',
            },
          ],
        },
      })

      getMockRwsInstance().simulateMessage(snapshotFrame)

      // Reconnect: the base replays the subscribe and the venue re-sends the
      // same snapshot.
      getMockRwsInstance().simulateOpen()
      await flushMicrotasks()
      getMockRwsInstance().simulateMessage(snapshotFrame)

      expect(listener).toHaveBeenCalledTimes(2)
      for (const call of listener.mock.calls) {
        expect(call[0].data).toHaveLength(0)
      }
    })

    it('delivers fills when the venue echoes the user address in checksummed form', async () => {
      const provider = createEnrichingProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'fills', dex: 'hyperliquid', address: '0xAbCdUser1' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'userFills',
          data: {
            isSnapshot: false,
            user: '0xAbCdUser1',
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
      expect(event.data[0]).toMatchObject({ id: '555', market: { id: 'BTC' } })
    })

    it('routes every address-keyed channel case-insensitively on a checksummed echo', async () => {
      const provider = createEnrichingProvider()
      const address = '0xAbCdUser1'
      const fillsListener = vi.fn()
      const positionsListener = vi.fn()
      const spotListener = vi.fn()
      const ordersListener = vi.fn()

      await provider.subscribe(
        { channel: 'fills', dex: 'hyperliquid', address },
        fillsListener
      )
      await provider.subscribe(
        { channel: 'positions', dex: 'hyperliquid', address },
        positionsListener
      )
      await provider.subscribe(
        { channel: 'spotBalances', dex: 'hyperliquid', address },
        spotListener
      )
      await provider.subscribe(
        { channel: 'orderUpdates', dex: 'hyperliquid', address },
        ordersListener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'userFills',
          data: { isSnapshot: false, user: address, fills: [] },
        })
      )
      getMockRwsInstance().simulateMessage(
        allDexsFrame(address, [['', ['BTC']]])
      )
      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'spotState',
          data: { user: address, spotState: { balances: [] } },
        })
      )
      getMockRwsInstance().simulateMessage(
        JSON.stringify({ channel: 'orderUpdates', data: [] })
      )

      expect(fillsListener).toHaveBeenCalledOnce()
      expect(positionsListener).toHaveBeenCalledOnce()
      expect(spotListener).toHaveBeenCalledOnce()
      expect(ordersListener).toHaveBeenCalledOnce()
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
      } as Market
      const provider = createEnrichingProvider([...HL_MARKETS, PURR_SPOT])
      const listener = vi.fn()

      await seedFast({ 'PURR/USDC': { midPx: '0.5' } })

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

    it('drops zero-size assetPositions, matching the REST getPositions policy', async () => {
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
                    {
                      position: {
                        coin: 'ETH',
                        szi: '0',
                        entryPx: '3300',
                        positionValue: '0',
                        liquidationPx: null,
                        unrealizedPnl: '0',
                        marginUsed: '0',
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

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.channel).toBe('positions')
      expect(event.data).toHaveLength(1)
      expect(event.data[0].market.id).toBe('BTC')
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
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

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

      expect(warnSpy).toHaveBeenCalledOnce()
      expect(listener).toHaveBeenCalledWith({ channel: 'fills', data: [] })
      warnSpy.mockRestore()
    })

    it('should ignore pong messages', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage(JSON.stringify({ channel: 'pong' }))

      expect(listener).not.toHaveBeenCalled()
    })

    it('should ignore subscriptionResponse messages', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
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
        { channel: 'marketsContext', dex: 'hyperliquid' },
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
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'error',
          data: 'Already subscribed: {"type":"fastAssetCtxs"}',
        })
      )

      expect(listener).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledOnce()
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('server error'),
        'Already subscribed: {"type":"fastAssetCtxs"}'
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
      const orderListener = vi.fn()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        priceListener
      )
      await provider.subscribe(
        { channel: 'orderUpdates', dex: 'hyperliquid', address: '0xuser1' },
        orderListener
      )

      // Out-of-range timestamp: the handler throws while building createdAt.
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
                timestamp: 1e20,
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

      // A subsequent good frame on a different channel must still be delivered.
      seedMids({ BTC: '95000' })

      expect(errorSpy).toHaveBeenCalledOnce()
      expect(orderListener).not.toHaveBeenCalled()
      const event = priceListener.mock.calls.at(-1)?.[0]
      expect(event.channel).toBe('marketsContext')
      expect(event.data.BTC.midPrice).toBe('95000')
      errorSpy.mockRestore()
    })

    it('should not notify a listener after it unsubscribes', async () => {
      const provider = createProvider()
      const listener = vi.fn()

      const unsub = await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      unsub()

      seedMids({ BTC: '96000' })

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

  describe('unknown-market items in account streams', () => {
    it('emits the known market positions when a frame also carries an unknown market', async () => {
      const provider = createEnrichingProvider(HL_MARKETS)
      const listener = vi.fn()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await provider.subscribe(
        { channel: 'positions', dex: 'hyperliquid', address: '0xuser1' },
        listener
      )

      getMockRwsInstance().simulateMessage(
        allDexsFrame('0xuser1', [
          ['', ['BTC']],
          ['xyz', ['xyz:BRENTOIL']],
        ])
      )

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.channel).toBe('positions')
      expect(event.data).toHaveLength(1)
      expect(event.data[0]).toMatchObject({ market: { id: 'BTC' } })
      expect(warnSpy).toHaveBeenCalledOnce()
      warnSpy.mockRestore()
    })

    it('emits the known market fill when a frame also carries an unknown market', async () => {
      const provider = createEnrichingProvider(HL_MARKETS)
      const listener = vi.fn()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await provider.subscribe(
        { channel: 'fills', dex: 'hyperliquid', address: '0xuser1' },
        listener
      )

      const fill = {
        side: 'B',
        px: '94000',
        sz: '0.1',
        dir: 'Buy',
        fee: '4.70',
        closedPnl: '0',
        time: 1704067200000,
        startPosition: '0.0',
      }
      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'userFills',
          data: {
            isSnapshot: false,
            user: '0xuser1',
            fills: [
              { ...fill, tid: 1, coin: '@999' },
              { ...fill, tid: 2, coin: 'BTC' },
            ],
          },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.data).toHaveLength(1)
      expect(event.data[0]).toMatchObject({ id: '2', market: { id: 'BTC' } })
      warnSpy.mockRestore()
    })

    it('emits the known market order when a frame also carries an unknown market', async () => {
      const provider = createEnrichingProvider(HL_MARKETS)
      const listener = vi.fn()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await provider.subscribe(
        { channel: 'orderUpdates', dex: 'hyperliquid', address: '0xuser1' },
        listener
      )

      const order = {
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
      }
      getMockRwsInstance().simulateMessage(
        JSON.stringify({
          channel: 'orderUpdates',
          data: [
            {
              order: { ...order, oid: 100, coin: 'xyz:BRENTOIL' },
              status: 'open',
              statusTimestamp: 1704067200000,
            },
            {
              order: { ...order, oid: 101, coin: 'BTC' },
              status: 'open',
              statusTimestamp: 1704067200000,
            },
          ],
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.data.openOrders).toHaveLength(1)
      expect(event.data.openOrders[0]).toMatchObject({
        orderId: '101',
        market: { id: 'BTC' },
      })
      warnSpy.mockRestore()
    })

    it('refetches the registry on an unknown market id and maps it on the next frame', async () => {
      marketsFetchMock.mockReset()
      marketsFetchMock
        .mockResolvedValueOnce({ markets: HL_MARKETS })
        .mockResolvedValue({ markets: [...HL_MARKETS, XYZ_BRENTOIL_MARKET] })
      const provider = new HyperliquidWsProvider(
        'wss://api.hyperliquid.xyz/ws',
        providerKey,
        freshClient()
      )
      const listener = vi.fn()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await provider.subscribe(
        { channel: 'positions', dex: 'hyperliquid', address: '0xuser1' },
        listener
      )

      const frame = allDexsFrame('0xuser1', [
        ['', ['BTC']],
        ['xyz', ['xyz:BRENTOIL']],
      ])
      getMockRwsInstance().simulateMessage(frame)
      await flushMicrotasks()
      getMockRwsInstance().simulateMessage(frame)

      expect(marketsFetchMock).toHaveBeenCalledTimes(2)
      expect(listener).toHaveBeenCalledTimes(2)
      expect(
        listener.mock.calls[0][0].data.map((p: any) => p.market.id)
      ).toEqual(['BTC'])
      expect(
        listener.mock.calls[1][0].data.map((p: any) => p.market.id)
      ).toEqual(['BTC', 'xyz:BRENTOIL'])
      warnSpy.mockRestore()
    })

    it('refetches at most once per cooldown window for a persistently unknown market', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        marketsFetchMock.mockReset()
        marketsFetchMock.mockResolvedValue({ markets: HL_MARKETS })
        const provider = new HyperliquidWsProvider(
          'wss://api.hyperliquid.xyz/ws',
          providerKey,
          freshClient()
        )
        const listener = vi.fn()

        await provider.subscribe(
          { channel: 'positions', dex: 'hyperliquid', address: '0xuser1' },
          listener
        )
        expect(marketsFetchMock).toHaveBeenCalledTimes(1)

        const frame = allDexsFrame('0xuser1', [['xyz', ['xyz:BRENTOIL']]])
        getMockRwsInstance().simulateMessage(frame)
        await flushMicrotasks()
        expect(marketsFetchMock).toHaveBeenCalledTimes(2)

        getMockRwsInstance().simulateMessage(frame)
        await flushMicrotasks()
        expect(marketsFetchMock).toHaveBeenCalledTimes(2)

        vi.setSystemTime(Date.now() + 60_000)
        getMockRwsInstance().simulateMessage(frame)
        await flushMicrotasks()
        expect(marketsFetchMock).toHaveBeenCalledTimes(3)

        // Every frame still emitted (empty — the only position is unknown).
        expect(listener).toHaveBeenCalledTimes(3)
      } finally {
        warnSpy.mockRestore()
        vi.useRealTimers()
      }
    })
  })

  describe('resubscribe on reconnect', () => {
    it('should resend all active subscriptions on open', async () => {
      const provider = createProvider()

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'hyperliquid' },
        vi.fn()
      )
      await provider.subscribe(
        { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
        vi.fn()
      )

      getMockRwsInstance().sent = [] // Clear initial subscribe messages

      // Simulate reconnection; the base's replay loop awaits each send.
      getMockRwsInstance().simulateOpen()
      await flushMicrotasks()

      // pac + sac + fastAssetCtxs + compact l2 orderbook
      expect(getMockRwsInstance().sent).toHaveLength(4)
      const payloads = getMockRwsInstance().sent.map((s) => JSON.parse(s))
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: { type: 'pac' },
      })
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: { type: 'sac' },
      })
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: { type: 'fastAssetCtxs' },
      })
      expect(payloads).toContainEqual({
        method: 'subscribe',
        subscription: { type: 'l2', c: 'BTC', s: null, m: null },
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
      await flushMicrotasks()

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
        { channel: 'marketsContext', dex: 'hyperliquid' },
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
        { channel: 'marketsContext', dex: 'hyperliquid' },
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
        { channel: 'marketsContext', dex: 'hyperliquid' },
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
        { channel: 'marketsContext', dex: 'hyperliquid' },
        listener
      )

      provider.close()

      seedMids({ BTC: '95000' })

      expect(listener).not.toHaveBeenCalled()
    })
  })
})
