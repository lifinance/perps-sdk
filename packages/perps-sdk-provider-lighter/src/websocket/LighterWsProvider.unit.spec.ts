import { createPerpsClient } from '@lifi/perps-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIGHTER_RH_PROVIDER_KEY, LIGHTER_RH_WS_URL } from '../constants.js'
import { lighterProvider } from '../LighterProvider.js'
import { LighterWsProvider, lighterWsProvider } from './LighterWsProvider.js'

// The market registry fetches `${apiUrl}/markets` over HTTP — served by the
// global fetch stub installed in beforeEach below.
const marketsFetchMock = vi.fn()

const marketsFailureResponse = () =>
  new Response(JSON.stringify({ code: 1, message: 'markets fetch failed' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })

// Minimal valid Lighter raw payloads matching the perps-types shapes.
const RAW_ORDER = {
  order_index: 1,
  client_order_index: 0,
  order_id: 'ord1',
  client_order_id: '',
  market_index: 0,
  owner_account_index: 42,
  initial_base_amount: '1.0',
  price: '50000',
  nonce: 1,
  remaining_base_amount: '1.0',
  is_ask: true,
  filled_base_amount: '0',
  filled_quote_amount: '0',
  side: 'sell',
  type: 'limit',
  time_in_force: 'good_till_time',
  reduce_only: false,
  trigger_price: '0',
  order_expiry: 0,
  status: 'open',
  trigger_status: 'na',
  trigger_time: 0,
  block_height: 100,
  timestamp: 1000,
  created_at: 1000,
  updated_at: 1000,
  transaction_time: 1000,
}

const RAW_TRADE = {
  trade_id: 1,
  tx_hash: '0xabc',
  type: 'trade',
  market_id: 0,
  size: '0.5',
  price: '50000',
  usd_amount: '25000',
  ask_id: 1,
  bid_id: 2,
  ask_account_id: 99,
  bid_account_id: 42,
  is_maker_ask: true,
  block_height: 100,
  timestamp: 1000,
  taker_fee: 0,
  maker_fee: 0,
  transaction_time: 1000,
}

const RAW_POSITION = {
  market_id: 0,
  symbol: 'BTC',
  initial_margin_fraction: '5.00',
  open_order_count: 0,
  pending_order_count: 0,
  position_tied_order_count: 0,
  sign: 1,
  position: '1.0',
  avg_entry_price: '50000',
  position_value: '50000',
  unrealized_pnl: '0',
  realized_pnl: '0',
  liquidation_price: '40000',
  total_funding_paid_out: '0',
  margin_mode: 0,
  allocated_margin: '2500',
  total_discount: '0',
}

const TEST_ADDR = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
const ACCOUNT_IDX = 42

describe('LighterWsProvider', () => {
  const BTC_LOGO = 'https://cdn.test/btc.svg'

  const LIGHTER_MARKETS = [
    {
      providerId: 'lighter',
      id: '0',
      categoryId: 'lighter',
      baseAsset: {
        providerId: 'lighter',
        id: '0',
        displaySymbol: 'BTC',
        logoURI: BTC_LOGO,
      },
      quoteAsset: {
        providerId: 'lighter',
        id: 'USDC',
        displaySymbol: 'USDC',
        logoURI: '',
      },
    },
    {
      providerId: 'lighter',
      id: '1',
      categoryId: 'lighter',
      baseAsset: {
        providerId: 'lighter',
        id: '1',
        displaySymbol: 'ETH',
        logoURI: '',
      },
      quoteAsset: {
        providerId: 'lighter',
        id: 'USDC',
        displaySymbol: 'USDC',
        logoURI: '',
      },
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
    marketsFetchMock.mockResolvedValue({ markets: LIGHTER_MARKETS })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Fresh client per provider: the market registry is cached per
  // (client, provider) pair, so a shared client would leak registry state
  // across tests.
  const freshClient = () =>
    createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })

  const makeProvider = () =>
    new LighterWsProvider(
      // Non-resolvable URL — we never open the socket in these tests.
      'ws://127.0.0.1:1',
      'lighter',
      {},
      freshClient()
    )

  /** Seed the account-index cache and sync the market registry so handleMessage can route without a live socket. */
  const seedAccountAndMarkets = async (p: LighterWsProvider) => {
    ;(p as any).accountIndexCache.set(TEST_ADDR, ACCOUNT_IDX)
    await (p as any).registry.sync()
  }

  /** Inject a listener directly, bypassing the subscribe WS path. */
  const inject = (p: LighterWsProvider, key: string, fn: () => void) => {
    ;(p as any).channels.set(key, { listeners: new Map([[fn, 1]]) })
  }

  it('accepts candle subscriptions as a no-op (Lighter has no candle WS channel)', async () => {
    const provider = makeProvider()
    const listener = vi.fn()
    const unsubscribe = await provider.subscribe(
      {
        channel: 'candle',
        dex: 'lighter',
        assetId: 'BTC',
        interval: '1h',
      },
      listener
    )
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
    expect(listener).not.toHaveBeenCalled()
    provider.close()
  })

  it('reports connection status to the subscriber onStatus and forwards transitions', async () => {
    const provider = makeProvider()
    const onStatus = vi.fn()
    const unsubscribe = await provider.subscribe(
      { channel: 'candle', dex: 'lighter', assetId: 'BTC', interval: '1h' },
      vi.fn(),
      onStatus
    )

    // Current status delivered synchronously; socket starts reconnecting.
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting')

    // The provider bridges the underlying rws status to its subscribers.
    for (const fn of (provider as any).statusListeners.keys()) {
      fn('disconnected')
    }
    expect(onStatus).toHaveBeenLastCalledWith('disconnected')

    unsubscribe()
    expect((provider as any).statusListeners.size).toBe(0)
    provider.close()
  })

  it('delivers status to each active subscription and drops it on unsubscribe', async () => {
    const provider = makeProvider()
    ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
    ;(provider as any).rws.send = vi.fn()
    const onStatusA = vi.fn()
    const onStatusB = vi.fn()

    const unsubA = await provider.subscribe(
      { channel: 'marketsContext', dex: 'lighter' },
      vi.fn(),
      onStatusA
    )
    await provider.subscribe(
      { channel: 'orderbook', dex: 'lighter', marketId: '5' },
      vi.fn(),
      onStatusB
    )

    unsubA()
    onStatusA.mockClear()
    onStatusB.mockClear()

    for (const fn of (provider as any).statusListeners.keys()) {
      fn('reconnecting')
    }
    expect(onStatusA).not.toHaveBeenCalled()
    expect(onStatusB).toHaveBeenCalledWith('reconnecting')
    provider.close()
  })

  it('stops delivering data to a listener after it unsubscribes', async () => {
    const provider = makeProvider()
    ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
    ;(provider as any).rws.send = vi.fn()
    const listener = vi.fn()

    const unsubscribe = await provider.subscribe(
      { channel: 'marketsContext', dex: 'lighter' },
      listener
    )
    unsubscribe()
    listener.mockClear()

    ;(provider as any).handleMessage(
      JSON.stringify({
        type: 'update/market_stats',
        market_stats: { '0': { market_id: 0, last_trade_price: '50000' } },
      })
    )
    expect(listener).not.toHaveBeenCalled()
    provider.close()
  })

  it('rejects spotBalances which Lighter does not expose', async () => {
    const provider = makeProvider()
    await expect(
      provider.subscribe(
        {
          channel: 'spotBalances',
          dex: 'lighter',
          address: '0x1234567890123456789012345678901234567890',
        },
        () => {}
      )
    ).rejects.toThrow(/does not support channel: spotBalances/)
    provider.close()
  })

  it('rejects orderbook subscription for unknown assets', async () => {
    const provider = makeProvider()
    await expect(
      provider.subscribe(
        { channel: 'orderbook', dex: 'lighter', assetId: 'UNKNOWN_COIN' },
        () => {}
      )
    ).rejects.toThrow(/unknown market/)
    provider.close()
  })

  describe('addressFromChannel', () => {
    it('resolves address with slash separator (subscribe format)', () => {
      const p = makeProvider()
      ;(p as any).accountIndexCache.set(TEST_ADDR, ACCOUNT_IDX)
      expect(
        (p as any).addressFromChannel(
          `account_all_orders/${ACCOUNT_IDX}`,
          'account_all_orders'
        )
      ).toBe(TEST_ADDR)
      p.close()
    })

    it('resolves address with colon separator (server response format)', () => {
      const p = makeProvider()
      ;(p as any).accountIndexCache.set(TEST_ADDR, ACCOUNT_IDX)
      expect(
        (p as any).addressFromChannel(
          `account_all_orders:${ACCOUNT_IDX}`,
          'account_all_orders'
        )
      ).toBe(TEST_ADDR)
      p.close()
    })

    it('returns null for unknown account index', () => {
      const p = makeProvider()
      ;(p as any).accountIndexCache.set(TEST_ADDR, ACCOUNT_IDX)
      expect(
        (p as any).addressFromChannel(
          'account_all_orders:99',
          'account_all_orders'
        )
      ).toBeNull()
      p.close()
    })

    it('returns null when separator is missing', () => {
      const p = makeProvider()
      ;(p as any).accountIndexCache.set(TEST_ADDR, ACCOUNT_IDX)
      expect(
        (p as any).addressFromChannel(
          `account_all_orders${ACCOUNT_IDX}`,
          'account_all_orders'
        )
      ).toBeNull()
      p.close()
    })
  })

  describe('public trades', () => {
    it('subscribes to the trade channel for the market', async () => {
      const provider = makeProvider()
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
      ;(provider as any).rws.getStatus = () => 'connected'
      const send = vi.fn()
      ;(provider as any).rws.send = send

      await provider.subscribe(
        { channel: 'trades', dex: 'lighter', marketId: '5' },
        vi.fn()
      )

      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'trade/5' })
      )
      provider.close()
    })

    it('maps update/trade frames to the trades event (is_maker_ask → taker side)', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'trades:0', listener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'update/trade',
          channel: 'trade:0',
          trades: [
            {
              trade_id: 16164557907,
              size: '0.1336',
              price: '2181.83',
              is_maker_ask: false,
              timestamp: 1773854156654,
            },
          ],
        })
      )

      expect(listener).toHaveBeenCalledWith({
        channel: 'trades',
        data: [
          {
            provider: 'lighter',
            marketId: '0',
            price: '2181.83',
            size: '0.1336',
            timestamp: 1773854156654,
            side: 'sell',
            id: '16164557907',
          },
        ],
      })
      p.close()
    })

    it('treats is_maker_ask=true as a taker buy and prefers trade_id_str', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'trades:0', listener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'update/trade',
          channel: 'trade:0',
          trades: [
            {
              trade_id: 1,
              trade_id_str: '99999999999999',
              size: '0.5',
              price: '50000',
              is_maker_ask: true,
              timestamp: 1000,
            },
          ],
        })
      )

      expect(listener).toHaveBeenCalledWith({
        channel: 'trades',
        data: [
          {
            provider: 'lighter',
            marketId: '0',
            price: '50000',
            size: '0.5',
            timestamp: 1000,
            side: 'buy',
            id: '99999999999999',
          },
        ],
      })
      p.close()
    })

    it('emits nothing for an empty trades batch', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'trades:0', listener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'subscribed/trade',
          channel: 'trade:0',
          trades: [],
        })
      )

      expect(listener).not.toHaveBeenCalled()
      p.close()
    })
  })

  describe('orderbook', () => {
    const feedBook = (
      p: LighterWsProvider,
      type: 'subscribed/order_book' | 'update/order_book',
      bids: Array<{ price: string; size: string }>,
      asks: Array<{ price: string; size: string }>
    ) =>
      (p as any).handleMessage(
        JSON.stringify({
          type,
          channel: 'order_book:0',
          order_book: { bids, asks },
        })
      )

    it('emits bids high→low and asks low→high, sorted by numeric price', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'orderbook:0', listener)

      // Wire order is deliberately unsorted and mixes single- and multi-digit
      // integers so a lexical sort would misorder ('9' vs '100').
      feedBook(
        p,
        'subscribed/order_book',
        [
          { price: '100', size: '1' },
          { price: '9', size: '2' },
          { price: '99.5', size: '3' },
        ],
        [
          { price: '101', size: '4' },
          { price: '9.5', size: '5' },
          { price: '100.5', size: '6' },
        ]
      )

      expect(listener).toHaveBeenCalledOnce()
      const book = listener.mock.calls[0][0]
      expect(book.channel).toBe('orderbook')
      expect(book.data.provider).toBe('lighter')
      expect(book.data.marketId).toBe('0')
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

    it('stamps a second instance’s provider key on emitted data', () => {
      const p = new LighterWsProvider(
        LIGHTER_RH_WS_URL,
        LIGHTER_RH_PROVIDER_KEY,
        {},
        freshClient()
      )
      const listener = vi.fn()
      inject(p, 'orderbook:0', listener)
      feedBook(
        p,
        'subscribed/order_book',
        [{ price: '100', size: '1' }],
        [{ price: '101', size: '2' }]
      )
      expect(listener.mock.calls[0][0].data.provider).toBe(
        LIGHTER_RH_PROVIDER_KEY
      )
      p.close()
    })

    it('applies deltas incrementally: inserts, size updates, and zero-size deletes', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'orderbook:0', listener)

      feedBook(
        p,
        'subscribed/order_book',
        [
          { price: '100', size: '1' },
          { price: '99', size: '2' },
        ],
        [{ price: '101', size: '3' }]
      )
      // Insert a new bid, resize an existing bid, delete a bid (size 0).
      feedBook(
        p,
        'update/order_book',
        [
          { price: '99.5', size: '9' },
          { price: '100', size: '5' },
          { price: '99', size: '0' },
        ],
        []
      )

      const book = listener.mock.calls[1][0]
      expect(book.data.bids).toEqual([
        { price: '100', size: '5' },
        { price: '99.5', size: '9' },
      ])
      expect(book.data.asks).toEqual([{ price: '101', size: '3' }])
      p.close()
    })

    it('reseeds the book from a fresh snapshot rather than merging into stale state', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'orderbook:0', listener)

      feedBook(
        p,
        'subscribed/order_book',
        [{ price: '100', size: '1' }],
        [{ price: '101', size: '2' }]
      )
      feedBook(
        p,
        'subscribed/order_book',
        [{ price: '200', size: '7' }],
        [{ price: '201', size: '8' }]
      )

      const book = listener.mock.calls[1][0]
      expect(book.data.bids).toEqual([{ price: '200', size: '7' }])
      expect(book.data.asks).toEqual([{ price: '201', size: '8' }])
      p.close()
    })

    it('maintains full depth (no level cap) — Lighter streams the whole book', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'orderbook:0', listener)

      const bids = Array.from({ length: 50 }, (_, i) => ({
        price: String(1000 - i),
        size: '1',
      }))
      const asks = Array.from({ length: 50 }, (_, i) => ({
        price: String(1001 + i),
        size: '1',
      }))
      feedBook(p, 'subscribed/order_book', bids, asks)

      const book = listener.mock.calls[0][0]
      expect(book.data.bids).toHaveLength(50)
      expect(book.data.asks).toHaveLength(50)
      expect(book.data.bids[0].price).toBe('1000')
      expect(book.data.asks[0].price).toBe('1001')
      p.close()
    })
  })

  describe('handleMessage — auth channels (indexed-by-market format)', () => {
    it('emits orderUpdates when orders arrive as { marketIndex: [Order] } object', async () => {
      const p = makeProvider()
      await seedAccountAndMarkets(p)
      const listener = vi.fn()
      inject(p, `orderUpdates:${TEST_ADDR}`, listener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'update/account_all_orders',
          channel: `account_all_orders:${ACCOUNT_IDX}`,
          orders: { '0': [RAW_ORDER] },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.channel).toBe('orderUpdates')
      expect(event.data.openOrders).toHaveLength(1)
      expect(event.data.triggerOrders).toHaveLength(0)
      expect(event.data.openOrders[0].orderId).toBe('1')
      p.close()
    })

    it('emits orderUpdates when orders span multiple markets', async () => {
      const p = makeProvider()
      await seedAccountAndMarkets(p)
      const listener = vi.fn()
      inject(p, `orderUpdates:${TEST_ADDR}`, listener)

      const ethOrder = { ...RAW_ORDER, order_id: 'ord2', market_index: 1 }
      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'update/account_all_orders',
          channel: `account_all_orders:${ACCOUNT_IDX}`,
          orders: { '0': [RAW_ORDER], '1': [ethOrder] },
        })
      )

      const event = listener.mock.calls[0][0]
      expect(event.data.openOrders).toHaveLength(2)
      expect(event.data.triggerOrders).toHaveLength(0)
      p.close()
    })

    it('emits fills when trades arrive as { marketIndex: [Trade] } object', async () => {
      const p = makeProvider()
      await seedAccountAndMarkets(p)
      const listener = vi.fn()
      inject(p, `fills:${TEST_ADDR}`, listener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'update/account_all_trades',
          channel: `account_all_trades:${ACCOUNT_IDX}`,
          trades: { '0': [RAW_TRADE] },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.channel).toBe('fills')
      expect(event.data).toHaveLength(1)
      expect(event.data[0].id).toBe('1')
      expect(event.data[0].market.baseAsset.logoURI).toBe(BTC_LOGO)
      p.close()
    })

    it('emits fills with empty array on initial subscribed snapshot (trades: [])', async () => {
      const p = makeProvider()
      await seedAccountAndMarkets(p)
      const listener = vi.fn()
      inject(p, `fills:${TEST_ADDR}`, listener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'subscribed/account_all_trades',
          channel: `account_all_trades:${ACCOUNT_IDX}`,
          trades: [],
          total_volume: 0,
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      expect(listener.mock.calls[0][0].data).toHaveLength(0)
      p.close()
    })

    it('emits positions when positions arrive as { marketIndex: Position } object', async () => {
      const p = makeProvider()
      await seedAccountAndMarkets(p)
      const listener = vi.fn()
      inject(p, `positions:${TEST_ADDR}`, listener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'subscribed/account_all_positions',
          channel: `account_all_positions:${ACCOUNT_IDX}`,
          positions: { '0': RAW_POSITION },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.channel).toBe('positions')
      expect(event.data).toHaveLength(1)
      expect(event.data[0].entryPrice).toBe('50000')
      expect(event.data[0].leverage).toBe(20)
      p.close()
    })

    it('keeps a close observable: a zero-size update removes the market from the emitted snapshot', async () => {
      const p = makeProvider()
      await seedAccountAndMarkets(p)
      const listener = vi.fn()
      inject(p, `positions:${TEST_ADDR}`, listener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'subscribed/account_all_positions',
          channel: `account_all_positions:${ACCOUNT_IDX}`,
          positions: {
            '0': RAW_POSITION,
            '1': { ...RAW_POSITION, market_id: 1, symbol: 'ETH' },
          },
        })
      )
      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'update/account_all_positions',
          channel: `account_all_positions:${ACCOUNT_IDX}`,
          positions: {
            '0': { ...RAW_POSITION, position: '0', position_value: '0' },
          },
        })
      )

      expect(listener).toHaveBeenCalledTimes(2)
      const snapshot = listener.mock.calls[1][0]
      expect(snapshot.data).toHaveLength(1)
      expect(snapshot.data[0].market.id).toBe('1')
      p.close()
    })

    it('merges partial updates into the snapshot instead of emitting them bare', async () => {
      const p = makeProvider()
      await seedAccountAndMarkets(p)
      const listener = vi.fn()
      inject(p, `positions:${TEST_ADDR}`, listener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'subscribed/account_all_positions',
          channel: `account_all_positions:${ACCOUNT_IDX}`,
          positions: { '0': RAW_POSITION },
        })
      )
      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'update/account_all_positions',
          channel: `account_all_positions:${ACCOUNT_IDX}`,
          positions: {
            '1': { ...RAW_POSITION, market_id: 1, symbol: 'ETH' },
          },
        })
      )

      expect(listener).toHaveBeenCalledTimes(2)
      const snapshot = listener.mock.calls[1][0]
      expect(snapshot.data.map((pos: any) => pos.market.id).sort()).toEqual([
        '0',
        '1',
      ])
      p.close()
    })

    it('reseeds positions state from a fresh subscribed snapshot', async () => {
      const p = makeProvider()
      await seedAccountAndMarkets(p)
      const listener = vi.fn()
      inject(p, `positions:${TEST_ADDR}`, listener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'subscribed/account_all_positions',
          channel: `account_all_positions:${ACCOUNT_IDX}`,
          positions: { '0': RAW_POSITION },
        })
      )
      // Reconnect resubscription: the new snapshot replaces prior state, so a
      // market that closed while disconnected does not linger.
      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'subscribed/account_all_positions',
          channel: `account_all_positions:${ACCOUNT_IDX}`,
          positions: {
            '1': { ...RAW_POSITION, market_id: 1, symbol: 'ETH' },
          },
        })
      )

      expect(listener).toHaveBeenCalledTimes(2)
      const snapshot = listener.mock.calls[1][0]
      expect(snapshot.data).toHaveLength(1)
      expect(snapshot.data[0].market.id).toBe('1')
      p.close()
    })

    it('ignores auth channel messages whose account index is not cached', () => {
      const p = makeProvider()
      // Intentionally do NOT populate accountIndexCache.
      const listener = vi.fn()
      inject(p, `orderUpdates:${TEST_ADDR}`, listener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'update/account_all_orders',
          channel: 'account_all_orders:999',
          orders: { '0': [RAW_ORDER] },
        })
      )

      expect(listener).not.toHaveBeenCalled()
      p.close()
    })
  })

  describe('resubscribe error isolation', () => {
    /**
     * Drive the base's replay loop with two active auth subs where the first
     * channel's auth fetch rejects. The second must still be sent and the
     * rejection must be caught (no unhandled promise rejection escaping the
     * open handler).
     */
    it('resubscribes remaining channels when one channel auth fetch rejects, and surfaces the failure', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const failingAddr = TEST_ADDR
      const okAddr = '0x1111111111111111111111111111111111111111'
      const provider = new LighterWsProvider('ws://127.0.0.1:1', 'lighter', {
        resolveAuthToken: async (address) => {
          if (address.toLowerCase() === failingAddr.toLowerCase()) {
            throw new Error('RO token revoked')
          }
          return 'token'
        },
      })
      const send = vi.fn()
      ;(provider as any).rws.send = send
      // Socket is down, so registerSub records without sending.
      await (provider as any).registerSub('account_all_orders/42', {
        channel: 'account_all_orders/42',
        address: failingAddr,
        needsAuth: true,
      })
      await (provider as any).registerSub('account_all_orders/7', {
        channel: 'account_all_orders/7',
        address: okAddr,
        needsAuth: true,
      })

      await expect((provider as any).replaySubs()).resolves.toBeUndefined()

      expect(send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'subscribe',
          channel: 'account_all_orders/7',
          auth: 'token',
        })
      )
      expect(send).not.toHaveBeenCalledWith(
        expect.stringContaining('account_all_orders/42')
      )
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining('account_all_orders/42'),
        expect.any(Error)
      )
      errSpy.mockRestore()
      provider.close()
    })

    it('does not double-subscribe when subscribing before the socket opens', async () => {
      const provider = makeProvider()
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
      const send = vi.fn()
      ;(provider as any).rws.send = send
      // Socket is still connecting (real rws getStatus stays 'reconnecting').

      await provider.subscribe(
        { channel: 'marketsContext', dex: 'lighter' },
        vi.fn()
      )

      // Nothing sent inline while disconnected — the open replay is the sole sender.
      expect(send).not.toHaveBeenCalled()

      await (provider as any).replaySubs()

      // `marketsContext` fans out to perp + spot stats channels.
      expect(send).toHaveBeenCalledTimes(2)
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'market_stats/all' })
      )
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'spot_market_stats/all' })
      )
      provider.close()
    })
  })

  describe('handleMessage — failure isolation', () => {
    it('logs and skips a frame that is not valid JSON', () => {
      const p = makeProvider()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      ;(p as any).handleMessage('not valid json{{{')

      expect(warnSpy).toHaveBeenCalledOnce()
      warnSpy.mockRestore()
      p.close()
    })

    it('logs and skips a structurally-invalid frame before it reaches the handler', () => {
      const p = makeProvider()
      const listener = vi.fn()
      inject(p, 'orderbook:5', listener)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // order_book frame missing the required `order_book` payload.
      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'update/order_book',
          channel: 'order_book:5',
        })
      )

      expect(listener).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledOnce()
      expect(errorSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
      errorSpy.mockRestore()
      p.close()
    })

    it('logs a throwing handler instead of swallowing it, and keeps handling later frames', async () => {
      const p = makeProvider()
      await seedAccountAndMarkets(p)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const throwingListener = vi.fn(() => {
        throw new Error('subscriber blew up')
      })
      inject(p, `fills:${TEST_ADDR}`, throwingListener)

      const goodListener = vi.fn()
      inject(p, `orderUpdates:${TEST_ADDR}`, goodListener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'update/account_all_trades',
          channel: `account_all_trades:${ACCOUNT_IDX}`,
          trades: { '0': [RAW_TRADE] },
        })
      )

      // The bad frame surfaced via the error log rather than vanishing.
      expect(throwingListener).toHaveBeenCalledOnce()
      expect(errorSpy).toHaveBeenCalledOnce()

      // A subsequent good frame on another channel is still delivered.
      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'update/account_all_orders',
          channel: `account_all_orders:${ACCOUNT_IDX}`,
          orders: { '0': [RAW_ORDER] },
        })
      )

      expect(goodListener).toHaveBeenCalledOnce()
      errorSpy.mockRestore()
      p.close()
    })
  })

  describe('keepalive framing', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('sends exactly one Lighter-native keepalive per interval and never a method-framed ping', () => {
      const provider = makeProvider()
      const rws = (provider as any).rws
      const send = vi.fn()
      ;(rws as any).socket = {
        readyState: 1,
        retryCount: 0,
        send,
        close: vi.fn(),
        reconnect: vi.fn(),
      }
      ;(rws as any).handleOpen()
      send.mockClear()

      vi.advanceTimersByTime(30_000)

      expect(send).toHaveBeenCalledTimes(1)
      expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }))
      expect(
        send.mock.calls.some(([frame]) =>
          String(frame).includes('"method":"ping"')
        )
      ).toBe(false)
      provider.close()
    })
  })

  describe('markets fetch coupling', () => {
    const makeFetchingProvider = () =>
      new LighterWsProvider('ws://127.0.0.1:1', 'lighter', {}, freshClient())

    it('subscribes to marketsContext even when the /markets fetch fails', async () => {
      marketsFetchMock.mockReset()
      marketsFetchMock.mockResolvedValue(marketsFailureResponse())
      const provider = makeFetchingProvider()
      // Stub the socket as open so subscribe sends inline without a real connection.
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
      ;(provider as any).rws.getStatus = () => 'connected'
      const send = vi.fn()
      ;(provider as any).rws.send = send

      const listener = vi.fn()
      const unsubscribe = await provider.subscribe(
        { channel: 'marketsContext', dex: 'lighter' },
        listener
      )

      expect(typeof unsubscribe).toBe('function')
      expect(marketsFetchMock).not.toHaveBeenCalled()
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'market_stats/all' })
      )
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'spot_market_stats/all' })
      )

      // Perp context (keyed by String(market_id)) carries oracle/mark/mid.
      ;(provider as any).handleMessage(
        JSON.stringify({
          type: 'update/market_stats',
          market_stats: {
            '0': {
              market_id: 0,
              index_price: '49998',
              mark_price: '50000',
              mid_price: '50001',
              open_interest: '12.5',
              last_trade_price: '50002',
              current_funding_rate: '0.0001',
              funding_rate: '0.00009',
              funding_timestamp: 1704067200000,
              daily_base_token_volume: '10',
              daily_quote_token_volume: '500000',
              daily_price_change: '1.2',
            },
          },
        })
      )
      expect(listener).toHaveBeenCalledOnce()
      const perpEvent = listener.mock.calls[0][0]
      expect(perpEvent.channel).toBe('marketsContext')
      expect(perpEvent.data['0']).toMatchObject({
        marketId: '0',
        midPrice: '50001',
        markPrice: '50000',
        oraclePrice: '49998',
        priceChange24h: '1.2',
        openInterest: '12.5',
      })

      // Spot ticks (2048+ ids) arrive on the spot channel and merge into the
      // same `marketsContext` emit; spot carries oracle + mid, mark folds to mid.
      ;(provider as any).handleMessage(
        JSON.stringify({
          type: 'update/spot_market_stats',
          spot_market_stats: {
            '2048': {
              market_id: 2048,
              symbol: 'LIT/USDC',
              index_price: '1814.00',
              mid_price: '1814.34',
              best_ask_price: '1814.40',
              best_bid_price: '1814.28',
              last_trade_price: '1814.34',
              daily_base_token_volume: 100,
              daily_quote_token_volume: 200,
              daily_price_low: 1800,
              daily_price_high: 1820,
              daily_price_change: 0.5,
            },
          },
        })
      )
      expect(listener).toHaveBeenCalledTimes(2)
      const spotEvent = listener.mock.calls[1][0]
      expect(Object.keys(spotEvent.data).sort()).toEqual(['0', '2048'])
      expect(spotEvent.data['2048']).toMatchObject({
        marketId: '2048',
        midPrice: '1814.34',
        markPrice: '1814.34',
        oraclePrice: '1814.00',
        priceChange24h: '0.5',
      })
      provider.close()
    })

    it('subscribes to one perp marketContext channel and emits a single context', async () => {
      marketsFetchMock.mockReset()
      marketsFetchMock.mockResolvedValue(marketsFailureResponse())
      const provider = makeFetchingProvider()
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
      ;(provider as any).rws.getStatus = () => 'connected'
      const send = vi.fn()
      ;(provider as any).rws.send = send
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketContext', dex: 'lighter', marketId: '0' },
        listener
      )

      expect(marketsFetchMock).not.toHaveBeenCalled()
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'market_stats/0' })
      )

      ;(provider as any).handleMessage(
        JSON.stringify({
          type: 'update/market_stats',
          channel: 'market_stats/0',
          market_stats: {
            market_id: 0,
            index_price: '49998',
            mark_price: '50000',
            mid_price: '50001',
            open_interest: '12.5',
            last_trade_price: '50002',
            current_funding_rate: '0.0001',
            funding_rate: '0.00009',
            funding_timestamp: 1704067200000,
            daily_base_token_volume: '10',
            daily_quote_token_volume: '500000',
            daily_price_change: '1.2',
          },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      expect(listener.mock.calls[0][0]).toMatchObject({
        channel: 'marketContext',
        data: {
          marketId: '0',
          midPrice: '50001',
          markPrice: '50000',
          oraclePrice: '49998',
          volume24h: '500000',
          funding: { rate: '0.0001' },
        },
      })
      provider.close()
    })

    it('subscribes to one spot marketContext channel and emits a single context', async () => {
      const provider = makeFetchingProvider()
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
      ;(provider as any).rws.getStatus = () => 'connected'
      const send = vi.fn()
      ;(provider as any).rws.send = send
      const listener = vi.fn()

      await provider.subscribe(
        { channel: 'marketContext', dex: 'lighter', marketId: '2048' },
        listener
      )

      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'spot_market_stats/2048' })
      )

      ;(provider as any).handleMessage(
        JSON.stringify({
          type: 'update/spot_market_stats',
          channel: 'spot_market_stats/2048',
          spot_market_stats: {
            market_id: 2048,
            symbol: 'LIT/USDC',
            index_price: '1814.00',
            mid_price: '1814.34',
            best_ask_price: '1814.40',
            best_bid_price: '1814.28',
            last_trade_price: '1814.34',
            daily_base_token_volume: 100,
            daily_quote_token_volume: 200,
            daily_price_low: 1800,
            daily_price_high: 1820,
            daily_price_change: 0.5,
          },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      expect(listener.mock.calls[0][0]).toMatchObject({
        channel: 'marketContext',
        data: {
          marketId: '2048',
          midPrice: '1814.34',
          markPrice: '1814.34',
          oraclePrice: '1814.00',
          volume24h: '200',
          priceChange24h: '0.5',
        },
      })
      expect(listener.mock.calls[0][0].data.funding).toBeUndefined()
      expect(listener.mock.calls[0][0].data.openInterest).toBeUndefined()
      provider.close()
    })

    it('subscribes to orderbook even when the /markets fetch fails', async () => {
      marketsFetchMock.mockReset()
      marketsFetchMock.mockResolvedValue(marketsFailureResponse())
      const provider = makeFetchingProvider()
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
      ;(provider as any).rws.getStatus = () => 'connected'
      const send = vi.fn()
      ;(provider as any).rws.send = send

      const unsubscribe = await provider.subscribe(
        { channel: 'orderbook', dex: 'lighter', marketId: '5' },
        vi.fn()
      )

      expect(typeof unsubscribe).toBe('function')
      expect(marketsFetchMock).not.toHaveBeenCalled()
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'order_book/5' })
      )
      provider.close()
    })

    it('ignores the orderbook priceStep hint — Lighter streams the full book', async () => {
      const provider = makeFetchingProvider()
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
      ;(provider as any).rws.getStatus = () => 'connected'
      const send = vi.fn()
      ;(provider as any).rws.send = send

      await provider.subscribe(
        {
          channel: 'orderbook',
          dex: 'lighter',
          marketId: '5',
          depth: 30,
          priceStep: 10,
        },
        vi.fn()
      )

      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'order_book/5' })
      )
      provider.close()
    })

    it('retries the markets fetch on the next subscribe after a transient failure', async () => {
      marketsFetchMock.mockReset()
      marketsFetchMock
        .mockResolvedValueOnce(marketsFailureResponse())
        .mockResolvedValue({ markets: LIGHTER_MARKETS })
      const provider = new LighterWsProvider(
        'ws://127.0.0.1:1',
        'lighter',
        { resolveAuthToken: async () => 'token' },
        freshClient()
      )
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
      ;(provider as any).rws.send = vi.fn()
      vi.spyOn(provider as any, 'resolveAccountIndex').mockResolvedValue(
        ACCOUNT_IDX
      )

      await expect(
        provider.subscribe(
          { channel: 'positions', dex: 'lighter', address: TEST_ADDR },
          vi.fn()
        )
      ).rejects.toThrow('markets fetch failed')

      // Connectivity restored — the next subscribe must refetch and succeed.
      await provider.subscribe(
        { channel: 'positions', dex: 'lighter', address: TEST_ADDR },
        vi.fn()
      )

      expect(marketsFetchMock).toHaveBeenCalledTimes(2)
      expect((provider as any).registry.get('0')?.baseAsset.displaySymbol).toBe(
        'BTC'
      )
      provider.close()
    })

    it('recovers the account-index lookup within one subscribe on a transient 405 (rate-limit retry)', async () => {
      const accountFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response('blocked', {
            status: 405,
            headers: { 'Retry-After': '0' },
          })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ code: 200, accounts: [{ index: ACCOUNT_IDX }] }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        )
      vi.stubGlobal('fetch', accountFetch)
      try {
        const provider = new LighterWsProvider('ws://127.0.0.1:1', 'lighter', {
          resolveAuthToken: async () => 'token',
        })
        ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
        ;(provider as any).rws.getStatus = () => 'connected'
        const send = vi.fn()
        ;(provider as any).rws.send = send

        await provider.subscribe(
          { channel: 'positions', dex: 'lighter', address: TEST_ADDR },
          vi.fn()
        )

        expect(accountFetch).toHaveBeenCalledTimes(2)
        expect((provider as any).accountIndexCache.get(TEST_ADDR)).toBe(
          ACCOUNT_IDX
        )
        expect(send).toHaveBeenCalledWith(
          JSON.stringify({
            type: 'subscribe',
            channel: `account_all_positions/${ACCOUNT_IDX}`,
            auth: 'token',
          })
        )
        provider.close()
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('retries the account-index fetch on the next subscribe after a transient failure', async () => {
      const provider = new LighterWsProvider('ws://127.0.0.1:1', 'lighter', {
        resolveAuthToken: async () => 'token',
      })
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
      ;(provider as any).rws.send = vi.fn()
      const fetchSpy = vi
        .spyOn(provider as any, 'fetchAccountIndex')
        .mockRejectedValueOnce(new Error('account route 500'))
        .mockResolvedValue(ACCOUNT_IDX)

      await expect(
        provider.subscribe(
          { channel: 'positions', dex: 'lighter', address: TEST_ADDR },
          vi.fn()
        )
      ).rejects.toThrow('account route 500')

      await provider.subscribe(
        { channel: 'positions', dex: 'lighter', address: TEST_ADDR },
        vi.fn()
      )

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect((provider as any).accountIndexCache.get(TEST_ADDR)).toBe(
        ACCOUNT_IDX
      )
      provider.close()
    })

    it('still syncs the market registry for auth channels (positions)', async () => {
      const provider = new LighterWsProvider(
        'ws://127.0.0.1:1',
        'lighter',
        { resolveAuthToken: async () => 'token' },
        freshClient()
      )
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
      ;(provider as any).rws.send = vi.fn()
      // Skip the live /api/v1/account resolution.
      ;(provider as any).accountIndexCache.set(TEST_ADDR, ACCOUNT_IDX)
      vi.spyOn(provider as any, 'resolveAccountIndex').mockResolvedValue(
        ACCOUNT_IDX
      )

      const listener = vi.fn()
      await provider.subscribe(
        { channel: 'positions', dex: 'lighter', address: TEST_ADDR },
        listener
      )

      expect(marketsFetchMock).toHaveBeenCalledOnce()
      expect((provider as any).registry.get('0')?.baseAsset.displaySymbol).toBe(
        'BTC'
      )

      ;(provider as any).handleMessage(
        JSON.stringify({
          type: 'subscribed/account_all_positions',
          channel: `account_all_positions:${ACCOUNT_IDX}`,
          positions: { '0': RAW_POSITION },
        })
      )
      const event = listener.mock.calls[0][0]
      expect(event.data[0].market.baseAsset.displaySymbol).toBe('BTC')
      provider.close()
    })
  })

  describe('accountSummary via user_stats', () => {
    it('maps a user_stats frame through the net-semantics identities', () => {
      const p = makeProvider()
      ;(p as any).accountIndexCache.set(TEST_ADDR, ACCOUNT_IDX)
      const listener = vi.fn()
      inject(p, `accountSummary:${TEST_ADDR}`, listener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'update/user_stats',
          channel: `user_stats:${ACCOUNT_IDX}`,
          stats: {
            collateral: '25.777769',
            portfolio_value: '35.072119',
            available_balance: '11.056250',
          },
        })
      )

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.channel).toBe('accountSummary')
      expect(event.data.portfolioValue).toBe('35.072119')
      expect(event.data.availableMargin).toBe('11.05625')
      // marginUsed = portfolio - available; unrealizedPnl = portfolio - collateral
      expect(Number.parseFloat(event.data.marginUsed)).toBeCloseTo(24.015869)
      expect(Number.parseFloat(event.data.unrealizedPnl)).toBeCloseTo(9.29435)
      p.close()
    })

    it('drops frames without parseable figures', () => {
      const p = makeProvider()
      ;(p as any).accountIndexCache.set(TEST_ADDR, ACCOUNT_IDX)
      const listener = vi.fn()
      inject(p, `accountSummary:${TEST_ADDR}`, listener)

      ;(p as any).handleMessage(
        JSON.stringify({
          type: 'update/user_stats',
          channel: `user_stats:${ACCOUNT_IDX}`,
          stats: {},
        })
      )

      expect(listener).not.toHaveBeenCalled()
      p.close()
    })

    it('subscribes user_stats without an auth token', async () => {
      const provider = makeProvider()
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
      ;(provider as any).rws.getStatus = () => 'connected'
      const send = vi.fn()
      ;(provider as any).rws.send = send
      ;(provider as any).accountIndexCache.set(TEST_ADDR, ACCOUNT_IDX)

      await provider.subscribe(
        { channel: 'accountSummary', dex: 'lighter', address: TEST_ADDR },
        vi.fn()
      )

      expect(send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'subscribe',
          channel: `user_stats/${ACCOUNT_IDX}`,
        })
      )
      provider.close()
    })
  })

  describe('auth resolution via the co-registered Lighter plugin', () => {
    // Construct exactly as PerpsWsClient does — the bare factory with no
    // `resolveAuthToken` override — so the auth token must come from the
    // `lighterProvider()` plugin registered on the same client.
    const bareProviderFor = (client: ReturnType<typeof createPerpsClient>) => {
      const provider = lighterWsProvider()({
        provider: 'lighter',
        wsUrl: 'ws://127.0.0.1:1',
        markets: [],
        client,
      }) as LighterWsProvider
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
      ;(provider as any).rws.getStatus = () => 'connected'
      vi.spyOn(provider as any, 'resolveAccountIndex').mockResolvedValue(
        ACCOUNT_IDX
      )
      return provider
    }

    it('authenticates a bare-constructed account subscribe and rotates the token on reconnect', async () => {
      let issued = 0
      const client = createPerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [lighterProvider({ authToken: () => `token-${++issued}` })],
      })
      const provider = bareProviderFor(client)
      const send = vi.fn()
      ;(provider as any).rws.send = send

      await provider.subscribe(
        { channel: 'positions', dex: 'lighter', address: TEST_ADDR },
        vi.fn()
      )

      expect(send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'subscribe',
          channel: `account_all_positions/${ACCOUNT_IDX}`,
          auth: 'token-1',
        })
      )

      // Simulated reconnect: the base replays every registered sub, and each
      // replay must re-resolve the token so a rotated credential is used.
      send.mockClear()
      await (provider as any).replaySubs()

      expect(send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'subscribe',
          channel: `account_all_positions/${ACCOUNT_IDX}`,
          auth: 'token-2',
        })
      )
      provider.close()
    })

    it('throws an actionable error when no Lighter plugin is registered on the client', async () => {
      const client = createPerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
      })
      const provider = bareProviderFor(client)
      ;(provider as any).rws.send = vi.fn()

      await expect(
        provider.subscribe(
          { channel: 'positions', dex: 'lighter', address: TEST_ADDR },
          vi.fn()
        )
      ).rejects.toThrow(/no auth-token resolver was available/)
      provider.close()
    })

    it('throws loudly on an auth channel when the plugin resolves no token (no silent degradation)', async () => {
      // `lighterProvider()` with no authToken/keyStore resolves `undefined`.
      const client = createPerpsClient({
        integrator: 'test-app',
        apiKey: 'test-key',
        providers: [lighterProvider()],
      })
      const provider = bareProviderFor(client)
      ;(provider as any).rws.send = vi.fn()

      await expect(
        provider.subscribe(
          { channel: 'positions', dex: 'lighter', address: TEST_ADDR },
          vi.fn()
        )
      ).rejects.toThrow(/no token was available for/)
      provider.close()
    })
  })
})
