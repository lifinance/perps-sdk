import { describe, expect, it, vi } from 'vitest'
import { LighterWsProvider } from './LighterWsProvider.js'

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
  trigger_status: '',
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
      { symbolMap: { BTC: 0, ETH: 1, SOL: 5 } }
    )

  /** Pre-populate caches so handleMessage can route without a live socket. */
  const primeProvider = (p: LighterWsProvider) => {
    ;(p as any).accountIndexCache.set(TEST_ADDR, ACCOUNT_IDX)
    ;(p as any).marketIdToSymbol.set(0, 'BTC')
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
      expect(event.data).toHaveLength(1)
      expect(event.data[0].orderId).toBe('ord1')
      p.close()
    })

    it('emits orderUpdates when orders span multiple markets', () => {
      const p = makeProvider()
      primeProvider(p)
      ;(p as any).marketIdToSymbol.set(1, 'ETH')
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
      expect(event.data).toHaveLength(2)
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
})
