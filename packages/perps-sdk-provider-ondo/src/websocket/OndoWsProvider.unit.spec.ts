import {
  createMemoryStorage,
  createPerpsClient,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import { PositionMarginAdjustment } from '@lifi/perps-types'
import type { Address } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ONDO_API_URL, DEFAULT_ONDO_WS_URL } from '../constants.js'
import { OndoWsProvider, ondoWsProvider } from './OndoWsProvider.js'

// The market registry fetches `${apiUrl}/markets` over HTTP — served by the
// global fetch stub installed in beforeEach below.
const marketsFetchMock = vi.fn()

const TEST_ADDR = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Address
const OTHER_ADDR = '0xcafecafecafecafecafecafecafecafecafecafe' as Address

const SESSION_KEY = `lifi-perps-ondo-session:api.ondoperps.xyz:${TEST_ADDR}`

const validToken = (jwt = 'jwt-abc') => ({
  identifier: TEST_ADDR,
  authType: 'siwe',
  accountId: 'acct-1',
  issuedAtSecs: Math.floor(Date.now() / 1000) - 60,
  expirationSecs: Math.floor(Date.now() / 1000) + 3600,
  token: jwt,
})

/** Storage pre-seeded with a valid production session for TEST_ADDR. */
const seededStorage = (): StorageAdapter => {
  const storage = createMemoryStorage()
  void storage.set(SESSION_KEY, JSON.stringify(validToken()))
  return storage
}

const OTHER_SESSION_KEY = `lifi-perps-ondo-session:api.ondoperps.xyz:${OTHER_ADDR}`

/** Storage seeded with distinct sessions for TEST_ADDR and OTHER_ADDR. */
const seededBothStorage = (): StorageAdapter => {
  const storage = createMemoryStorage()
  void storage.set(SESSION_KEY, JSON.stringify(validToken('jwt-a')))
  void storage.set(OTHER_SESSION_KEY, JSON.stringify(validToken('jwt-b')))
  return storage
}

// Minimal valid Ondo WS payloads matching the wire types.
const RAW_ORDER = {
  orderId: 'ord-1',
  side: 'buy',
  price: '227.50',
  size: '10.00',
  market: 'AAPL-USD.P',
  filledSize: '0.00',
  lastFillSize: '0.00',
  filledCost: '0.00',
  fee: '0.00',
  status: 'open',
  createdAt: '2025-03-05T14:30:00Z',
  type: 'limit',
  timeInForce: 'GTC',
}

const RAW_TRIGGER_ORDER = {
  ...RAW_ORDER,
  orderId: 'ord-2',
  type: 'stopMarket',
  status: 'untriggered',
  stopOrderType: 'stopLoss',
  triggerPrice: '220.00',
}

const RAW_FILL = {
  id: 'fill-1',
  orderId: 'ord-1',
  market: 'AAPL-USD.P',
  price: '227.50',
  size: '5.00',
  side: 'buy',
  filledCost: '1137.50',
  fee: '0.50',
  feeRebate: '0.10',
  time: '2025-03-05T14:30:00Z',
  isMaker: true,
  direction: 'openLong',
  pnl: '0',
}

const RAW_POSITION = {
  market: 'AAPL-USD.P',
  direction: 'long',
  netQuantity: '10.00',
  averageEntryPrice: '225.00',
  usedMargin: '1125.00',
  unrealizedPnl: '25.00',
  markPrice: '227.50',
  liquidationPrice: '180.00',
  bankruptcyPrice: '170.00',
  maintenanceMargin: '112.50',
  notionalValue: '2275.00',
  leverage: '2.0',
  netFundingSinceNeutral: '-1.23',
  returnOnEquity: '0.022',
}

describe('OndoWsProvider', () => {
  const ONDO_MARKETS = [
    {
      providerId: 'ondo',
      id: 'AAPL-USD.P',
      categoryId: 'ondo',
      baseAsset: {
        providerId: 'ondo',
        id: 'AAPL',
        displaySymbol: 'AAPL',
        logoURI: 'https://cdn.test/aapl.svg',
      },
      quoteAsset: {
        providerId: 'ondo',
        id: 'USD',
        displaySymbol: 'USD',
        logoURI: '',
      },
      positionMarginAdjustment: PositionMarginAdjustment.NONE,
    },
    {
      providerId: 'ondo',
      id: 'NVDA-USD.P',
      categoryId: 'ondo',
      baseAsset: {
        providerId: 'ondo',
        id: 'NVDA',
        displaySymbol: 'NVDA',
        logoURI: '',
      },
      quoteAsset: {
        providerId: 'ondo',
        id: 'USD',
        displaySymbol: 'USD',
        logoURI: '',
      },
      positionMarginAdjustment: PositionMarginAdjustment.NONE,
    },
  ]

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      async (input: RequestInfo | URL): Promise<Response> => {
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
      }
    )
    marketsFetchMock.mockReset()
    marketsFetchMock.mockResolvedValue({ markets: ONDO_MARKETS })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  // Fresh client per provider: the market registry is cached per
  // (client, provider) pair, so a shared client would leak registry state
  // across tests.
  const freshClient = () =>
    createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })

  const makeProvider = (storage: StorageAdapter = seededStorage()) =>
    new OndoWsProvider(
      // Non-resolvable URL — we never open the socket in these tests.
      'ws://127.0.0.1:1',
      'ondo',
      { storage },
      freshClient()
    )

  /** Stub the underlying socket so subscribes send inline and capture frames. */
  const stubSocket = (p: OndoWsProvider) => {
    const send = vi.fn()
    ;(p as any).rws.ready = vi.fn().mockResolvedValue(undefined)
    ;(p as any).rws.getStatus = () => 'connected'
    ;(p as any).rws.send = send
    ;(p as any).rws.reconnect = vi.fn()
    return send
  }

  /** Inject a listener directly, bypassing the subscribe WS path. */
  const inject = (p: OndoWsProvider, key: string, fn: (e: any) => void) => {
    ;(p as any).channels.set(key, { listeners: new Map([[fn, 1]]) })
  }

  const feed = (p: OndoWsProvider, frame: unknown) =>
    (p as any).handleMessage(JSON.stringify(frame))

  it('defaults to the production Ondo WS endpoint', () => {
    expect(DEFAULT_ONDO_WS_URL).toBe('wss://api.ondoperps.xyz/ws')
  })

  it('keeps the connection alive with Ondo-framed pings', () => {
    const p = makeProvider()
    expect((p as any).rws.pingPayload).toBe('{"op":"ping"}')
    p.close()
  })

  it('emits a single empty snapshot for spotBalances and holds the wire', async () => {
    const p = makeProvider()
    const send = stubSocket(p)
    const listener = vi.fn()

    await p.subscribe(
      { channel: 'spotBalances', dex: 'ondo', address: TEST_ADDR },
      listener
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ channel: 'spotBalances', data: [] })
    expect(send).not.toHaveBeenCalled()
    p.close()
  })

  describe('public market channels', () => {
    it('subscribes to depthBooksPerps for the market and unsubscribes on teardown', async () => {
      vi.useFakeTimers()
      const p = makeProvider()
      const send = stubSocket(p)

      const unsubscribe = await p.subscribe(
        { channel: 'orderbook', dex: 'ondo', marketId: 'AAPL-USD.P' },
        vi.fn()
      )
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({
          op: 'subscribe',
          channel: 'depthBooksPerps',
          markets: ['AAPL-USD.P'],
        })
      )

      unsubscribe()
      // Teardown lingers briefly so a quick resubscribe reuses the channel.
      await vi.advanceTimersByTimeAsync(300)
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({
          op: 'unsubscribe',
          channel: 'depthBooksPerps',
          markets: ['AAPL-USD.P'],
        })
      )
      p.close()
    })

    it('subscribes to tradesPerps for the market', async () => {
      const p = makeProvider()
      const send = stubSocket(p)
      await p.subscribe(
        { channel: 'trades', dex: 'ondo', marketId: 'NVDA-USD.P' },
        vi.fn()
      )
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({
          op: 'subscribe',
          channel: 'tradesPerps',
          markets: ['NVDA-USD.P'],
        })
      )
      p.close()
    })

    it('maps tradesPerps updates onto the generic trades event', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'trades:AAPL-USD.P', listener)

      feed(p, {
        type: 'update',
        channel: 'tradesPerps',
        data: [
          {
            market: 'AAPL-USD.P',
            price: '227.50',
            size: '5.00',
            cost: '1137.50',
            aggressor_side: 'buy',
            time: '2025-03-05T14:30:00Z',
            id: '70a37d8f',
          },
        ],
      })

      expect(listener).toHaveBeenCalledWith({
        channel: 'trades',
        data: [
          {
            provider: 'ondo',
            marketId: 'AAPL-USD.P',
            price: '227.50',
            size: '5.00',
            timestamp: Date.parse('2025-03-05T14:30:00Z'),
            side: 'buy',
            id: '70a37d8f',
          },
        ],
      })
      p.close()
    })

    it('demuxes multi-market trade batches to their own subscriptions', () => {
      const p = makeProvider()
      const aapl = vi.fn()
      const nvda = vi.fn()
      inject(p, 'trades:AAPL-USD.P', aapl)
      inject(p, 'trades:NVDA-USD.P', nvda)

      feed(p, {
        type: 'update',
        channel: 'tradesPerps',
        data: [
          {
            market: 'AAPL-USD.P',
            price: '227.50',
            size: '5.00',
            cost: '1137.50',
            aggressor_side: 'buy',
            time: '2025-03-05T14:30:00Z',
            id: 't-1',
          },
          {
            market: 'NVDA-USD.P',
            price: '900.00',
            size: '1.00',
            cost: '900.00',
            aggressor_side: 'sell',
            time: '2025-03-05T14:30:01Z',
            id: 't-2',
          },
        ],
      })

      expect(aapl).toHaveBeenCalledOnce()
      expect(aapl.mock.calls[0][0].data[0].id).toBe('t-1')
      expect(nvda).toHaveBeenCalledOnce()
      expect(nvda.mock.calls[0][0].data[0].side).toBe('sell')
      p.close()
    })

    it('maps depthBooksPerps snapshots onto the orderbook event, bids high→low and asks low→high', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'orderbook:AAPL-USD.P', listener)

      feed(p, {
        type: 'update',
        channel: 'depthBooksPerps',
        data: [
          {
            market: 'AAPL-USD.P',
            time: '2025-03-05T14:30:00Z',
            // Deliberately unsorted with single- and multi-digit integers so
            // a lexical sort would misorder ('9' vs '100').
            asks: [
              ['101', '4'],
              ['9.5', '5'],
              ['100.5', '6'],
            ],
            bids: [
              ['100', '1'],
              ['9', '2'],
              ['99.5', '3'],
            ],
          },
        ],
      })

      expect(listener).toHaveBeenCalledOnce()
      const book = listener.mock.calls[0][0]
      expect(book.channel).toBe('orderbook')
      expect(book.data.provider).toBe('ondo')
      expect(book.data.marketId).toBe('AAPL-USD.P')
      expect(book.data.timestamp).toBe(Date.parse('2025-03-05T14:30:00Z'))
      expect(book.data.bids).toEqual([
        { price: '100', size: '1' },
        { price: '99.5', size: '3' },
        { price: '9', size: '2' },
      ])
      expect(book.data.asks).toEqual([
        { price: '9.5', size: '5' },
        { price: '100.5', size: '6' },
        { price: '101', size: '4' },
      ])
      p.close()
    })

    it('replaces the book from each snapshot instead of merging deltas', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'orderbook:AAPL-USD.P', listener)

      const snapshot = (bids: string[][], asks: string[][]) =>
        feed(p, {
          type: 'update',
          channel: 'depthBooksPerps',
          data: [
            { market: 'AAPL-USD.P', time: '2025-03-05T14:30:00Z', bids, asks },
          ],
        })

      snapshot([['100', '1']], [['101', '2']])
      snapshot([['99', '3']], [])

      const book = listener.mock.calls[1][0]
      expect(book.data.bids).toEqual([{ price: '99', size: '3' }])
      expect(book.data.asks).toEqual([])
      p.close()
    })
  })

  describe('candles', () => {
    it('maps the SDK interval onto an Ondo kline resolution on subscribe', async () => {
      const p = makeProvider()
      const send = stubSocket(p)
      await p.subscribe(
        {
          channel: 'candle',
          dex: 'ondo',
          marketId: 'AAPL-USD.P',
          interval: '1h',
        },
        vi.fn()
      )
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({
          op: 'subscribe',
          channel: 'kLinePerps',
          markets: ['AAPL-USD.P'],
          resolution: '1H',
        })
      )
      p.close()
    })

    it('rejects OHLCV intervals Ondo does not offer', async () => {
      const p = makeProvider()
      await expect(
        p.subscribe(
          {
            channel: 'candle',
            dex: 'ondo',
            marketId: 'AAPL-USD.P',
            interval: '3m',
          },
          vi.fn()
        )
      ).rejects.toThrow(/does not support OHLCV interval/)
      p.close()
    })

    it('maps kline updates onto the candle event, recovering the interval from the bar span', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'candle:AAPL-USD.P:1m', listener)

      // The kline frame carries no resolution field — only the interval
      // start/end. e − s = 60s identifies the 1m subscription. The emitted
      // candle time is the bucket-open `s`, not the per-update `t`.
      feed(p, {
        type: 'update',
        channel: 'kLinePerps',
        data: {
          m: 'AAPL-USD.P',
          t: 1709648375,
          s: 1709648340,
          e: 1709648400,
          o: 226.8,
          h: 228.1,
          l: 226.5,
          c: 227.5,
          v: 12345.67,
          x: false,
        },
      })

      expect(listener).toHaveBeenCalledWith({
        channel: 'candle',
        data: {
          t: 1709648340 * 1000,
          o: '226.8',
          h: '228.1',
          l: '226.5',
          c: '227.5',
          v: '12345.67',
        },
      })
      p.close()
    })

    it('keys consecutive updates within one bucket to the same bucket-open time so the forming candle updates in place', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'candle:AAPL-USD.P:15m', listener)

      const bucketStart = 1709648100
      const bucketEnd = bucketStart + 900
      const frame = (t: number, c: number) => ({
        type: 'update' as const,
        channel: 'kLinePerps' as const,
        data: {
          m: 'AAPL-USD.P',
          t,
          s: bucketStart,
          e: bucketEnd,
          o: 226.8,
          h: 228.1,
          l: 226.5,
          c,
          v: 12345.67,
          x: false,
        },
      })

      feed(p, frame(bucketStart + 1, 227.0))
      feed(p, frame(bucketStart + 2, 227.5))

      const [first, second] = listener.mock.calls.map(([e]) => e.data.t)
      expect(first).toBe(bucketStart * 1000)
      expect(second).toBe(bucketStart * 1000)
      // Widget keys candles by Math.floor(t / 1000); an unchanged key across a
      // bucket's lifetime is what makes the merge update rather than append.
      expect(Math.floor(first / 1000)).toBe(Math.floor(second / 1000))
    })
  })

  describe('markets context', () => {
    it('fans marketsContext out to markPricesPerps and fundingRatesPerps', async () => {
      const p = makeProvider()
      const send = stubSocket(p)
      await p.subscribe({ channel: 'marketsContext', dex: 'ondo' }, vi.fn())
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ op: 'subscribe', channel: 'markPricesPerps' })
      )
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ op: 'subscribe', channel: 'fundingRatesPerps' })
      )
      p.close()
    })

    it('emits the aggregated context record on mark price updates, with markPrice standing in for midPrice', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'marketsContext', listener)

      feed(p, {
        type: 'update',
        channel: 'markPricesPerps',
        data: [
          { market: 'AAPL-USD.P', markPrice: '227.50' },
          { market: 'NVDA-USD.P', markPrice: '900.00' },
        ],
      })

      expect(listener).toHaveBeenCalledWith({
        channel: 'marketsContext',
        data: {
          'AAPL-USD.P': {
            marketId: 'AAPL-USD.P',
            midPrice: '227.50',
            markPrice: '227.50',
          },
          'NVDA-USD.P': {
            marketId: 'NVDA-USD.P',
            midPrice: '900.00',
            markPrice: '900.00',
          },
        },
      })
      p.close()
    })

    it('merges funding rates into the context once the mark price is known', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'marketsContext', listener)

      // Funding arriving before any mark price must not fabricate a context
      // entry without prices…
      feed(p, {
        type: 'update',
        channel: 'fundingRatesPerps',
        data: [
          {
            market: 'AAPL-USD.P',
            rate: '0.0000125',
            intervalEnds: '2025-03-05T15:00:00Z',
            premiums: [],
          },
        ],
      })
      expect(listener).toHaveBeenLastCalledWith({
        channel: 'marketsContext',
        data: {},
      })

      // …but must surface on the entry as soon as the mark price lands.
      feed(p, {
        type: 'update',
        channel: 'markPricesPerps',
        data: [{ market: 'AAPL-USD.P', markPrice: '227.50' }],
      })
      expect(listener).toHaveBeenLastCalledWith({
        channel: 'marketsContext',
        data: {
          'AAPL-USD.P': {
            marketId: 'AAPL-USD.P',
            midPrice: '227.50',
            markPrice: '227.50',
            funding: {
              rate: '0.0000125',
              nextFundingTime: Date.parse('2025-03-05T15:00:00Z'),
            },
          },
        },
      })
      p.close()
    })

    it('subscribes marketContext with a market filter and emits the single context', async () => {
      const p = makeProvider()
      const send = stubSocket(p)
      const listener = vi.fn()
      await p.subscribe(
        { channel: 'marketContext', dex: 'ondo', marketId: 'AAPL-USD.P' },
        listener
      )
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({
          op: 'subscribe',
          channel: 'markPricesPerps',
          markets: ['AAPL-USD.P'],
        })
      )
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({
          op: 'subscribe',
          channel: 'fundingRatesPerps',
          markets: ['AAPL-USD.P'],
        })
      )

      feed(p, {
        type: 'update',
        channel: 'markPricesPerps',
        data: [{ market: 'AAPL-USD.P', markPrice: '227.50' }],
      })
      expect(listener).toHaveBeenCalledWith({
        channel: 'marketContext',
        data: {
          marketId: 'AAPL-USD.P',
          midPrice: '227.50',
          markPrice: '227.50',
        },
      })
      p.close()
    })
  })

  describe('authenticated channels', () => {
    it('logs in with the stored session JWT before the first private subscribe', async () => {
      const p = makeProvider()
      const send = stubSocket(p)

      await p.subscribe(
        { channel: 'orderUpdates', dex: 'ondo', address: TEST_ADDR },
        vi.fn()
      )

      expect(send.mock.calls[0][0]).toBe(
        JSON.stringify({ op: 'login', args: { token: 'jwt-abc' } })
      )
      expect(send.mock.calls[1][0]).toBe(
        JSON.stringify({ op: 'subscribe', channel: 'ordersPerps' })
      )
      p.close()
    })

    it('logs in only once per connection across private channels', async () => {
      const p = makeProvider()
      const send = stubSocket(p)

      await p.subscribe(
        { channel: 'orderUpdates', dex: 'ondo', address: TEST_ADDR },
        vi.fn()
      )
      await p.subscribe(
        { channel: 'positions', dex: 'ondo', address: TEST_ADDR },
        vi.fn()
      )

      const logins = send.mock.calls.filter((c) =>
        String(c[0]).includes('"op":"login"')
      )
      expect(logins).toHaveLength(1)
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ op: 'subscribe', channel: 'positionsPerps' })
      )
      p.close()
    })

    it('logs in again after the socket drops and reconnects', async () => {
      const p = makeProvider()
      const send = stubSocket(p)

      await p.subscribe(
        { channel: 'orderUpdates', dex: 'ondo', address: TEST_ADDR },
        vi.fn()
      )

      // Simulate a socket drop: the venue forgets the login with the
      // connection, so the next subscribe send must re-authenticate.
      for (const fn of (p as any).rws.listeners.close) {
        fn(1006, 'dropped')
      }
      await p.subscribe(
        { channel: 'fills', dex: 'ondo', address: TEST_ADDR },
        vi.fn()
      )

      const logins = send.mock.calls.filter((c) =>
        String(c[0]).includes('"op":"login"')
      )
      expect(logins).toHaveLength(2)
      p.close()
    })

    it('surfaces a session-expired error when no session token is stored', async () => {
      const p = makeProvider(createMemoryStorage())
      stubSocket(p)

      await expect(
        p.subscribe(
          { channel: 'orderUpdates', dex: 'ondo', address: TEST_ADDR },
          vi.fn()
        )
      ).rejects.toThrow(/session/i)
      p.close()
    })

    it('rejects a second authenticated address on the same connection', async () => {
      const p = makeProvider()
      stubSocket(p)

      await p.subscribe(
        { channel: 'orderUpdates', dex: 'ondo', address: TEST_ADDR },
        vi.fn()
      )
      await expect(
        p.subscribe(
          { channel: 'positions', dex: 'ondo', address: OTHER_ADDR },
          vi.fn()
        )
      ).rejects.toThrow(/address/i)
      p.close()
    })

    it('rebinds to a new address after the previous one unsubscribes to zero, logging in afresh', async () => {
      const p = makeProvider(seededBothStorage())
      const send = stubSocket(p)

      const unsubscribeA = await p.subscribe(
        { channel: 'positions', dex: 'ondo', address: TEST_ADDR },
        vi.fn()
      )
      // Release all of A's authenticated channels (unsubscribe-to-zero).
      unsubscribeA()

      // B must reclaim the binding A released (still lingering in the base's
      // teardown window), cycle the connection, and log in cleanly — not throw
      // the one-address guard.
      await p.subscribe(
        { channel: 'positions', dex: 'ondo', address: OTHER_ADDR },
        vi.fn()
      )

      expect((p as any).rws.reconnect).toHaveBeenCalledTimes(1)
      const logins = send.mock.calls
        .map((c) => String(c[0]))
        .filter((c) => c.includes('"op":"login"'))
      expect(logins).toEqual([
        JSON.stringify({ op: 'login', args: { token: 'jwt-a' } }),
        JSON.stringify({ op: 'login', args: { token: 'jwt-b' } }),
      ])
      p.close()
    })

    it('clears the address binding on a socket drop so a different address binds afterwards', async () => {
      const p = makeProvider(seededBothStorage())
      const send = stubSocket(p)

      await p.subscribe(
        { channel: 'orderUpdates', dex: 'ondo', address: TEST_ADDR },
        vi.fn()
      )
      expect((p as any).accountAddress).toBe(TEST_ADDR.toLowerCase())

      // The venue forgets the login with the connection, so the binding must
      // reset on close — not just loginPromise.
      for (const fn of (p as any).rws.listeners.close) {
        fn(1006, 'dropped')
      }
      expect((p as any).accountAddress).toBeUndefined()

      await p.subscribe(
        { channel: 'positions', dex: 'ondo', address: OTHER_ADDR },
        vi.fn()
      )
      expect((p as any).accountAddress).toBe(OTHER_ADDR.toLowerCase())
      const lastLogin = send.mock.calls
        .map((c) => String(c[0]))
        .filter((c) => c.includes('"op":"login"'))
        .at(-1)
      expect(lastLogin).toBe(
        JSON.stringify({ op: 'login', args: { token: 'jwt-b' } })
      )
      p.close()
    })

    it('rolls back the address binding when the login fails', async () => {
      // No stored session for TEST_ADDR → the login throws.
      const p = makeProvider(createMemoryStorage())
      stubSocket(p)

      await expect(
        p.subscribe(
          { channel: 'orderUpdates', dex: 'ondo', address: TEST_ADDR },
          vi.fn()
        )
      ).rejects.toThrow(/session/i)

      // A failed login must not leave the connection bound to TEST_ADDR.
      expect((p as any).accountAddress).toBeUndefined()
      p.close()
    })

    it('classifies ordersPerps updates into open, trigger and terminated buckets', async () => {
      const p = makeProvider()
      stubSocket(p)
      const listener = vi.fn()

      await p.subscribe(
        { channel: 'orderUpdates', dex: 'ondo', address: TEST_ADDR },
        listener
      )
      feed(p, {
        type: 'update',
        channel: 'ordersPerps',
        data: [
          RAW_ORDER,
          RAW_TRIGGER_ORDER,
          { ...RAW_ORDER, orderId: 'ord-3', status: 'canceled' },
        ],
      })

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.channel).toBe('orderUpdates')
      expect(event.data.openOrders).toHaveLength(1)
      expect(event.data.openOrders[0]).toMatchObject({
        orderId: 'ord-1',
        price: '227.50',
        originalSize: '10',
        remainingSize: '10',
      })
      expect(event.data.openOrders[0].market.baseAsset.displaySymbol).toBe(
        'AAPL'
      )
      expect(event.data.triggerOrders).toHaveLength(1)
      expect(event.data.triggerOrders[0].orderId).toBe('ord-2')
      expect(event.data.terminated).toEqual(['ord-3'])
      p.close()
    })

    it('carries both sizes of a partially filled ordersPerps order', async () => {
      const p = makeProvider()
      stubSocket(p)
      const listener = vi.fn()

      await p.subscribe(
        { channel: 'orderUpdates', dex: 'ondo', address: TEST_ADDR },
        listener
      )
      feed(p, {
        type: 'update',
        channel: 'ordersPerps',
        data: [{ ...RAW_ORDER, filledSize: '4.00', status: 'partiallyFilled' }],
      })

      const event = listener.mock.calls[0][0]
      expect(event.data.openOrders[0]).toMatchObject({
        orderId: 'ord-1',
        originalSize: '10',
        remainingSize: '6',
        filledSize: '4.00',
      })
      p.close()
    })

    it('maps fillsPerps updates onto the generic fills event', async () => {
      const p = makeProvider()
      stubSocket(p)
      const listener = vi.fn()

      await p.subscribe(
        { channel: 'fills', dex: 'ondo', address: TEST_ADDR },
        listener
      )
      feed(p, { type: 'update', channel: 'fillsPerps', data: [RAW_FILL] })

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.channel).toBe('fills')
      expect(event.data).toHaveLength(1)
      expect(event.data[0]).toMatchObject({
        id: 'fill-1',
        orderId: 'ord-1',
        size: '5.00',
        price: '227.50',
        // fee netted against Ondo's rebate
        fee: { amount: '0.4', asset: 'USD' },
      })
      expect(event.data[0].market.id).toBe('AAPL-USD.P')
      p.close()
    })

    it('emits positionsPerps updates as a full open-position snapshot, dropping neutral rows', async () => {
      const p = makeProvider()
      stubSocket(p)
      const listener = vi.fn()

      await p.subscribe(
        { channel: 'positions', dex: 'ondo', address: TEST_ADDR },
        listener
      )
      feed(p, {
        type: 'update',
        channel: 'positionsPerps',
        data: [
          RAW_POSITION,
          {
            ...RAW_POSITION,
            market: 'NVDA-USD.P',
            direction: 'neutral',
            netQuantity: '0',
          },
        ],
      })

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.channel).toBe('positions')
      expect(event.data).toHaveLength(1)
      expect(event.data[0]).toMatchObject({
        size: '10',
        entryPrice: '225.00',
        markPrice: '227.50',
      })
      expect(event.data[0].market.id).toBe('AAPL-USD.P')
      p.close()
    })
  })

  describe('accountSummary (REST-seeded, derived from positions and fills)', () => {
    const BALANCE = {
      walletBalance: '1000',
      realizedPnl: '0',
      unrealizedPnl: '50',
      marginBalance: '1050',
      usedMargin: '200',
      availableMargin: '850',
      withdrawableMargin: '850',
      maintenanceMarginRequirement: '0',
      totalMaintenanceMargin: '0',
      marginRatio: '0',
      leverage: '1',
      underLiquidation: false,
      totalFundingPayments: '0',
      totalTradingFees: '0',
      totalPnL: '0',
    }

    // Serve `/markets` (registry) and `/v1/perps/balance` (summary seed); the
    // balance result is mutable so a fills-driven refresh can observe a change.
    const stubFetch = (balance: () => unknown) => {
      vi.stubGlobal(
        'fetch',
        async (input: RequestInfo | URL): Promise<Response> => {
          const url = input.toString()
          const body = url.includes('/markets')
            ? { markets: ONDO_MARKETS }
            : url.includes('/v1/perps/balance')
              ? { success: true, result: balance() }
              : undefined
          if (body === undefined) {
            throw new Error(`Unexpected fetch: ${url}`)
          }
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      )
    }

    const subscribeSummary = async (p: OndoWsProvider, listener: () => void) =>
      p.subscribe(
        { channel: 'accountSummary', dex: 'ondo', address: TEST_ADDR },
        listener
      )

    it('seeds from the REST balance and emits an initial summary', async () => {
      stubFetch(() => BALANCE)
      const p = makeProvider()
      stubSocket(p)
      const listener = vi.fn()

      await subscribeSummary(p, listener)

      expect(listener).toHaveBeenCalledWith({
        channel: 'accountSummary',
        data: {
          portfolioValue: '1050',
          availableMargin: '850',
          marginUsed: '200',
          unrealizedPnl: '50',
        },
      })
      p.close()
    })

    it('recomputes margin and unrealized PnL from positionsPerps frames', async () => {
      stubFetch(() => BALANCE)
      const p = makeProvider()
      stubSocket(p)
      const listener = vi.fn()

      await subscribeSummary(p, listener)
      feed(p, {
        type: 'update',
        channel: 'positionsPerps',
        data: [RAW_POSITION],
      })

      // walletBalance (1000) is retained; positions supply margin/uPnL.
      expect(listener).toHaveBeenLastCalledWith({
        channel: 'accountSummary',
        data: {
          portfolioValue: '1025',
          availableMargin: '-100',
          marginUsed: '1125',
          unrealizedPnl: '25',
        },
      })
      p.close()
    })

    it('refreshes the wallet balance from REST on a fillsPerps frame', async () => {
      let walletBalance = '1000'
      stubFetch(() => ({ ...BALANCE, walletBalance }))
      const p = makeProvider()
      stubSocket(p)
      const listener = vi.fn()

      await subscribeSummary(p, listener)
      walletBalance = '1500'
      feed(p, { type: 'update', channel: 'fillsPerps', data: [RAW_FILL] })

      await vi.waitFor(() =>
        expect(listener).toHaveBeenLastCalledWith({
          channel: 'accountSummary',
          data: {
            portfolioValue: '1550',
            availableMargin: '1350',
            marginUsed: '200',
            unrealizedPnl: '50',
          },
        })
      )
      p.close()
    })

    it('shares one positionsPerps wire sub with a positions subscription', async () => {
      stubFetch(() => BALANCE)
      const p = makeProvider()
      const send = stubSocket(p)

      await p.subscribe(
        { channel: 'positions', dex: 'ondo', address: TEST_ADDR },
        vi.fn()
      )
      await subscribeSummary(p, vi.fn())

      const positionsSubs = send.mock.calls.filter(
        (c) =>
          c[0] ===
          JSON.stringify({ op: 'subscribe', channel: 'positionsPerps' })
      )
      expect(positionsSubs).toHaveLength(1)
      p.close()
    })

    it('surfaces a session-expired error when no session token is stored', async () => {
      stubFetch(() => BALANCE)
      const p = makeProvider(createMemoryStorage())
      stubSocket(p)

      await expect(subscribeSummary(p, vi.fn())).rejects.toThrow(/session/i)
      p.close()
    })
  })

  describe('protocol frames', () => {
    it('ignores acks and error frames without crashing', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'trades:AAPL-USD.P', listener)

      feed(p, { type: 'pong' })
      feed(p, { type: 'loggedIn', msg: 'Login successful' })
      feed(p, { type: 'subscribed', channel: 'tradesPerps' })
      feed(p, { type: 'unsubscribed', channel: 'tradesPerps' })
      feed(p, { type: 'error', msg: 'login required' })
      ;(p as any).handleMessage('not json')

      expect(listener).not.toHaveBeenCalled()
      p.close()
    })
  })

  describe('factory', () => {
    it('builds a provider bound to the discovered WS URL and provider key', () => {
      const factory = ondoWsProvider({ storage: createMemoryStorage() })
      const provider = factory({
        provider: 'ondo',
        wsUrl: 'ws://127.0.0.1:1',
        markets: [],
        client: freshClient(),
      })
      expect(provider).toBeInstanceOf(OndoWsProvider)
      provider.close()
    })

    it('defaults the API URL to production for session lookups', () => {
      const p = makeProvider()
      expect((p as any).tokenStore).toBeDefined()
      expect(DEFAULT_ONDO_API_URL).toBe('https://api.ondoperps.xyz')
      p.close()
    })
  })
})
