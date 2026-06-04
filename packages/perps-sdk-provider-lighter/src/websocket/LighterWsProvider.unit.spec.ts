import type { PerpsSDKClient } from '@lifi/perps-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  /** Pre-populate caches so handleMessage can route without a live socket. */
  const primeProvider = (p: LighterWsProvider) => {
    ;(p as any).accountIndexCache.set(TEST_ADDR, ACCOUNT_IDX)
    ;(p as any).marketIdToDisplaySymbol.set(0, 'BTC')
  }

  /** Inject a listener directly, bypassing the subscribe WS path. */
  const inject = (p: LighterWsProvider, key: string, fn: () => void) => {
    if (!(p as any).listeners.has(key)) {
      ;(p as any).listeners.set(key, new Set())
    }
    ;(p as any).listeners.get(key).add(fn)
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

  describe('onOpen resubscribe error isolation (ORD-516)', () => {
    /**
     * Drive onOpen with two active auth subs where the first channel's auth
     * fetch rejects. The second must still be sent and the rejection must be
     * caught (no unhandled promise rejection escaping the open handler).
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
      ;(provider as any).subs.set(`orderUpdates:${failingAddr}`, {
        count: 1,
        channel: 'account_all_orders/42',
        address: failingAddr,
        needsAuth: true,
      })
      ;(provider as any).subs.set(`orderUpdates:${okAddr}`, {
        count: 1,
        channel: 'account_all_orders/7',
        address: okAddr,
        needsAuth: true,
      })

      await expect((provider as any).onOpen()).resolves.toBeUndefined()

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
  })

  describe('display-symbol fetch coupling (ORD-482)', () => {
    const fakeClient = {} as PerpsSDKClient

    beforeEach(() => {
      getMarketsMock.mockReset()
    })

    /** No displaySymbolMap → ensureDisplaySymbols would hit coreGetMarkets. */
    const makeFetchingProvider = () =>
      new LighterWsProvider('ws://127.0.0.1:1', 'lighter', {}, fakeClient)

    it('subscribes to prices even when the /markets display-symbol fetch rejects', async () => {
      getMarketsMock.mockRejectedValue(new Error('markets route 500'))
      const provider = makeFetchingProvider()
      // Stub the socket so subscribe doesn't await a real connection.
      ;(provider as any).rws.ready = vi.fn().mockResolvedValue(undefined)
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
      expect((provider as any).marketIdToDisplaySymbol.get(0)).toBe('BTC')

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
