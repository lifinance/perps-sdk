import type { PerpsSDKClient } from '@lifi/perps-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LighterWsProvider } from './LighterWsProvider.js'

const getMarketsMock = vi.fn()

vi.mock('@lifi/perps-sdk', async (importActual) => {
  const actual = await importActual<typeof import('@lifi/perps-sdk')>()
  return {
    ...actual,
    getMarkets: (...args: unknown[]) => getMarketsMock(...args),
  }
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
  const makeProvider = () =>
    new LighterWsProvider(
      // Non-resolvable URL — we never open the socket in these tests.
      'ws://127.0.0.1:1',
      'lighter',
      { displaySymbolMap: { 0: 'BTC', 1: 'ETH', 5: 'SOL' } }
    )

  const BTC_LOGO = 'https://cdn.test/btc.svg'

  /** Pre-populate caches so handleMessage can route without a live socket. */
  const primeProvider = (p: LighterWsProvider) => {
    ;(p as any).accountIndexCache.set(TEST_ADDR, ACCOUNT_IDX)
    ;(p as any).marketIdToDisplaySymbol.set(0, {
      displaySymbol: 'BTC',
      logoURI: BTC_LOGO,
    })
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
      { channel: 'prices', dex: 'lighter' },
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
      { channel: 'prices', dex: 'lighter' },
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

  describe('handleMessage — auth channels (indexed-by-market format)', () => {
    it('emits orderUpdates when orders arrive as { marketIndex: [Order] } object', () => {
      const p = makeProvider()
      primeProvider(p)
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

    it('emits orderUpdates when orders span multiple markets', () => {
      const p = makeProvider()
      primeProvider(p)
      ;(p as any).marketIdToDisplaySymbol.set(1, 'ETH')
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

    it('emits fills when trades arrive as { marketIndex: [Trade] } object', () => {
      const p = makeProvider()
      primeProvider(p)
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

    it('emits fills with empty array on initial subscribed snapshot (trades: [])', () => {
      const p = makeProvider()
      primeProvider(p)
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

    it('emits positions when positions arrive as { marketIndex: Position } object', () => {
      const p = makeProvider()
      primeProvider(p)
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

    it('keeps a close observable: a zero-size update removes the market from the emitted snapshot', () => {
      const p = makeProvider()
      primeProvider(p)
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

    it('merges partial updates into the snapshot instead of emitting them bare', () => {
      const p = makeProvider()
      primeProvider(p)
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

    it('reseeds positions state from a fresh subscribed snapshot', () => {
      const p = makeProvider()
      primeProvider(p)
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
        authProvider: async (address) => {
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

      await provider.subscribe({ channel: 'prices', dex: 'lighter' }, vi.fn())

      // Nothing sent inline while disconnected — the open replay is the sole sender.
      expect(send).not.toHaveBeenCalled()

      await (provider as any).replaySubs()

      expect(send).toHaveBeenCalledTimes(1)
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'market_stats/all' })
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

    it('logs a throwing handler instead of swallowing it, and keeps handling later frames', () => {
      const p = makeProvider()
      primeProvider(p)
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

  describe('display-symbol fetch coupling (ORD-482)', () => {
    const fakeClient = { config: {} } as PerpsSDKClient

    beforeEach(() => {
      getMarketsMock.mockReset()
    })

    /** No displaySymbolMap → ensureDisplaySymbols would hit coreGetMarkets. */
    const makeFetchingProvider = () =>
      new LighterWsProvider('ws://127.0.0.1:1', 'lighter', {}, fakeClient)

    it('subscribes to prices even when the /markets display-symbol fetch rejects', async () => {
      getMarketsMock.mockRejectedValue(new Error('markets route 500'))
      const provider = makeFetchingProvider()
      // Stub the socket as open so subscribe sends inline without a real connection.
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
      ;(provider as any).rws.getStatus = () => 'connected'
      const send = vi.fn()
      ;(provider as any).rws.send = send

      const listener = vi.fn()
      const unsubscribe = await provider.subscribe(
        { channel: 'prices', dex: 'lighter' },
        listener
      )

      expect(typeof unsubscribe).toBe('function')
      expect(getMarketsMock).not.toHaveBeenCalled()
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', channel: 'market_stats/all' })
      )

      // Price ticks (keyed by String(market_id)) reach the listener.
      ;(provider as any).handleMessage(
        JSON.stringify({
          type: 'update/market_stats',
          market_stats: { '0': { market_id: 0, last_trade_price: '50000' } },
        })
      )
      expect(listener).toHaveBeenCalledOnce()
      expect(listener.mock.calls[0][0]).toEqual({
        channel: 'prices',
        data: { '0': '50000' },
      })
      provider.close()
    })

    it('subscribes to orderbook even when the /markets display-symbol fetch rejects', async () => {
      getMarketsMock.mockRejectedValue(new Error('markets route 500'))
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
      expect(getMarketsMock).not.toHaveBeenCalled()
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

    it('retries the display-symbol fetch on the next subscribe after a transient failure', async () => {
      getMarketsMock
        .mockRejectedValueOnce(new Error('markets route 500'))
        .mockResolvedValue({
          markets: [
            {
              id: '0',
              categoryId: 'lighter',
              baseAsset: { displaySymbol: 'BTC' },
            },
          ],
        })
      const provider = new LighterWsProvider(
        'ws://127.0.0.1:1',
        'lighter',
        { authProvider: async () => 'token' },
        fakeClient
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
      ).rejects.toThrow('markets route 500')

      // Connectivity restored — the next subscribe must refetch and succeed.
      await provider.subscribe(
        { channel: 'positions', dex: 'lighter', address: TEST_ADDR },
        vi.fn()
      )

      expect(getMarketsMock).toHaveBeenCalledTimes(2)
      expect(
        (provider as any).marketIdToDisplaySymbol.get(0)?.displaySymbol
      ).toBe('BTC')
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
          displaySymbolMap: { 0: 'BTC' },
          authProvider: async () => 'token',
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
        displaySymbolMap: { 0: 'BTC' },
        authProvider: async () => 'token',
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

    it('still resolves display symbols for auth channels (positions)', async () => {
      getMarketsMock.mockResolvedValue({
        markets: [
          {
            id: '0',
            categoryId: 'lighter',
            baseAsset: { displaySymbol: 'BTC' },
          },
        ],
      })
      const provider = new LighterWsProvider(
        'ws://127.0.0.1:1',
        'lighter',
        { authProvider: async () => 'token' },
        fakeClient
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

      expect(getMarketsMock).toHaveBeenCalledOnce()
      expect(
        (provider as any).marketIdToDisplaySymbol.get(0)?.displaySymbol
      ).toBe('BTC')

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
})
