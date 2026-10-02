import { isDecimalString, type PerpsSDKClient } from '@lifi/perps-sdk'
import { PositionMarginAdjustment } from '@lifi/perps-types'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { lighterProvider } from './LighterProvider.js'
import type { LtWsMarketStats } from './types/index.js'
import { mapMarketContext } from './utils/mapMarketContext.js'

/**
 * Values at `path`; a `[]` step maps over an array, and an absent branch
 * contributes nothing, so an optional field costs no extra path entry.
 */
const valuesAt = (root: unknown, path: string): unknown[] =>
  path.split('.').reduce<unknown[]>(
    (nodes, step) => {
      const key = step.endsWith('[]') ? step.slice(0, -2) : step
      const picked = nodes.flatMap((node) =>
        node == null ? [] : [(node as Record<string, unknown>)[key]]
      )
      return step.endsWith('[]')
        ? picked.flatMap((value) => (Array.isArray(value) ? value : []))
        : picked
    },
    [root]
  )

/**
 * Assert `path` carries at least one value and that every one of them is a
 * {@link isDecimalString}, so a path the fixture never populates fails rather
 * than passing on an empty set.
 */
const expectDecimalsAt = (root: unknown, path: string): void => {
  const values = valuesAt(root, path).filter((value) => value != null)
  expect(values.length, `${path} -> no value in the fixture`).toBeGreaterThan(0)
  for (const value of values) {
    expect(isDecimalString(value), `${path} -> ${String(value)}`).toBe(true)
  }
}

/** Every `DecimalString` field `Position` declares. */
const POSITION_FIELDS = [
  'size',
  'entryPrice',
  'markPrice',
  'liquidationPrice',
  'unrealizedPnl',
  'accruedFunding',
  'marginUsed',
  'initialMarginRequirement',
]

/** Every `DecimalString` field `Balance` declares. */
const BALANCE_FIELDS = ['units', 'valueUsd', 'price', 'transferable']

const ACCOUNT_PATHS = [
  ...BALANCE_FIELDS.map((f) => `balances[].${f}`),
  ...BALANCE_FIELDS.map((f) => `collateralBalances[].${f}`),
  ...POSITION_FIELDS.map((f) => `positions[].${f}`),
  'marginUsed',
  'unrealizedPnl',
  'feeTier.maker',
  'feeTier.taker',
]

// Lighter publishes no withdrawal fee, so a row never carries one.
const WITHDRAWABLE_PATHS = ['rows[].available', 'rows[].max']

const AVAILABLE_TO_TRADE_PATHS = ['buy', 'sell']

// The Lighter mapper publishes no previous-day price and no market cap.
const MARKET_CONTEXT_PATHS = [
  'midPrice',
  'markPrice',
  'oraclePrice',
  'priceChange24h',
  'volume24h',
  'openInterest',
  'funding.rate',
]

const POSITIONS_PATHS = POSITION_FIELDS.map((f) => `positions[].${f}`)

const ORDER_PATHS = [
  'orders[].originalSize',
  'orders[].remainingSize',
  'orders[].filledSize',
  'orders[].averagePrice',
  'orders[].price',
  'orders[].triggerPrice',
  'orders[].limitPrice',
]

// A Lighter fill carries no filled size of its own and no builder fee.
const FILL_PATHS = [
  'items[].size',
  'items[].price',
  'items[].realizedPnl',
  'items[].startPosition',
  'items[].fee.amount',
]

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const ACCOUNT_INDEX = 42
const BTC_MARKET_ID = 1
/** Spot market that prices asset index 7 — the sub-micro holding. */
const DUST_MARKET_ID = 7

const STUB_CLIENT = {
  config: { apiUrl: 'https://backend.test/v1/perps' },
} as PerpsSDKClient

const USDC = {
  providerId: 'lighter',
  id: '3',
  displaySymbol: 'USDC',
  logoURI: '',
}

const perpsMarket = {
  providerId: 'lighter',
  id: String(BTC_MARKET_ID),
  categoryId: 'lighter',
  baseAsset: {
    providerId: 'lighter',
    id: String(BTC_MARKET_ID),
    displaySymbol: 'BTC',
    logoURI: '',
  },
  quoteAsset: USDC,
  szDecimals: 5,
  priceDecimals: 2,
  maxLeverage: 50,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
}

/** The spot market whose mark prices the sub-micro `DUST` holding. */
const spotMarket = {
  ...perpsMarket,
  id: String(DUST_MARKET_ID),
  categoryId: 'spot',
  baseAsset: {
    providerId: 'lighter',
    id: String(DUST_MARKET_ID),
    displaySymbol: 'DUST',
    logoURI: '',
  },
}

const MARKETS_RESPONSE = { markets: [perpsMarket, spotMarket] }

/** A mark far below a cent, so a float spelling would surface as `5e-7`. */
const MARKETS_CONTEXT_RESPONSE = {
  prices: [
    {
      marketId: String(DUST_MARKET_ID),
      midPrice: '0.0000005',
      markPrice: '0.0000005',
    },
  ],
}

const PROVIDERS_RESPONSE = {
  providers: [
    {
      key: 'lighter',
      categories: [
        { id: 'lighter', quoteAsset: USDC },
        { id: 'spot', quoteAsset: null },
      ],
    },
  ],
}

const ASSETS_RESPONSE = {
  assets: [USDC, { ...spotMarket.baseAsset, decimals: 18 }],
}

const ACCOUNT_PAYLOAD = {
  code: 200,
  accounts: [
    {
      code: 0,
      account_type: 0,
      index: ACCOUNT_INDEX,
      account_index: ACCOUNT_INDEX,
      l1_address: ADDRESS,
      status: 1,
      available_balance: '4350.000000',
      collateral: '5000.000000',
      total_asset_value: '5250.000000',
      cross_asset_value: '5250.000000',
      cross_initial_margin_requirement: '900.000000',
      positions: [
        {
          market_id: BTC_MARKET_ID,
          symbol: 'BTC',
          initial_margin_fraction: '2.00',
          open_order_count: 1,
          pending_order_count: 0,
          position_tied_order_count: 0,
          sign: 1,
          // A sub-lot size, so a float hop would spell it `5e-7`.
          position: '0.0000005',
          avg_entry_price: '94000.0',
          position_value: '0.047',
          unrealized_pnl: '0.0000005',
          realized_pnl: '0.000000',
          liquidation_price: '0',
          total_funding_paid_out: '-0.0000001',
          margin_mode: 0,
          margin_set_flag: 1,
          allocated_margin: '0.000000',
        },
      ],
      assets: [
        {
          symbol: 'USDC',
          asset_id: 3,
          balance: '100.000000',
          locked_balance: '0.000000',
          margin_mode: 'disabled' as const,
          margin_balance: '5000.000000',
          multiplier: '1.000000000000000000',
        },
        {
          symbol: 'DUST',
          asset_id: DUST_MARKET_ID,
          balance: '0.0000005',
          locked_balance: '0.000000',
          margin_mode: 'disabled' as const,
          margin_balance: '0.0000005',
          multiplier: '1.000000000000000000',
        },
      ],
    },
  ],
}

const ACCOUNT_LIMITS = {
  code: 200,
  current_maker_fee_tick: 40,
  current_taker_fee_tick: 280,
}

const ACTIVE_ORDERS = {
  code: 0,
  orders: [
    {
      order_index: 88,
      client_order_index: 0,
      order_id: 'lt-88',
      client_order_id: '0',
      market_index: BTC_MARKET_ID,
      owner_account_index: ACCOUNT_INDEX,
      initial_base_amount: '0.0000005',
      price: '94000.0',
      nonce: 10,
      remaining_base_amount: '0.0000003',
      is_ask: false,
      filled_base_amount: '0.0000002',
      filled_quote_amount: '0.0188',
      side: 'buy',
      type: 'limit',
      time_in_force: 'good-till-time',
      reduce_only: false,
      trigger_price: '0',
      order_expiry: 1_775_000_900_000,
      status: 'open',
      trigger_status: 'na',
      trigger_time: 0,
      parent_order_index: 0,
      parent_order_id: '',
      to_trigger_order_id_0: '',
      to_trigger_order_id_1: '',
      to_cancel_order_id_0: '',
      block_height: 1,
      timestamp: 1_775_000_000,
      created_at: 1_775_000_000,
      updated_at: 1_775_000_100,
      transaction_time: 1_775_000_000_000_000,
    },
    // A stop-limit order, the only shape that carries a trigger and a limit.
    {
      order_index: 89,
      client_order_index: 0,
      order_id: 'lt-89',
      client_order_id: '0',
      market_index: BTC_MARKET_ID,
      owner_account_index: ACCOUNT_INDEX,
      initial_base_amount: '0.0000005',
      price: '0.0000005',
      nonce: 11,
      remaining_base_amount: '0.0000005',
      is_ask: true,
      filled_base_amount: '0',
      filled_quote_amount: '0',
      side: 'sell',
      type: 'stop-loss-limit',
      time_in_force: 'good-till-time',
      reduce_only: true,
      trigger_price: '90000.0',
      order_expiry: 1_775_000_900_000,
      status: 'open',
      trigger_status: 'pending',
      trigger_time: 0,
      parent_order_index: 0,
      parent_order_id: '',
      to_trigger_order_id_0: '',
      to_trigger_order_id_1: '',
      to_cancel_order_id_0: '',
      block_height: 1,
      timestamp: 1_775_000_000,
      created_at: 1_775_000_000,
      updated_at: 1_775_000_100,
      transaction_time: 1_775_000_000_000_000,
    },
  ],
}

const TRADES = {
  code: 200,
  trades: [
    {
      trade_id: 7,
      tx_hash: '0xabc',
      type: 'trade',
      market_id: BTC_MARKET_ID,
      size: '0.0000005',
      price: '94000',
      usd_amount: '0.047',
      ask_id: 100,
      bid_id: 200,
      ask_account_id: 0,
      bid_account_id: ACCOUNT_INDEX,
      is_maker_ask: false,
      // The viewer holds a short before the trade, so the buy reduces it and
      // realizes PnL against the pre-trade entry basis.
      maker_position_size_before: '-0.000001',
      maker_entry_quote_before: '0.0941',
      block_height: 1,
      timestamp: 1_700_000_000_000,
      taker_fee: 280,
      maker_fee: 40,
    },
  ],
}

/** Perp stats whose funding rate and daily change sit at the `1e-7` boundary. */
const SUB_MICRO_STATS: LtWsMarketStats = {
  market_id: BTC_MARKET_ID,
  index_price: '94000',
  mark_price: '94001',
  mid_price: '94000.5',
  open_interest: '0.0000005',
  last_trade_price: '94000',
  current_funding_rate: '0.0000001',
  funding_rate: '0.0000001',
  funding_timestamp: 1_700_000_000_000,
  daily_base_token_volume: 1,
  daily_quote_token_volume: 5e-7,
  daily_price_change: 1e-7,
}

const respond = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

describe('lighter emits a DecimalString on every typed field', () => {
  let reads: {
    account: unknown
    withdrawable: unknown
    availableToTrade: unknown
    positions: unknown
    orders: unknown
    fills: unknown
  }

  beforeAll(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('backend.test/v1/perps/marketsContext')) {
          return respond(MARKETS_CONTEXT_RESPONSE)
        }
        if (u.includes('backend.test/v1/perps/markets')) {
          return respond(MARKETS_RESPONSE)
        }
        if (u.includes('backend.test/v1/perps/assets')) {
          return respond(ASSETS_RESPONSE)
        }
        if (u.includes('backend.test/v1/perps/providers')) {
          return respond(PROVIDERS_RESPONSE)
        }
        if (u.includes('/api/v1/accountLimits')) {
          return respond(ACCOUNT_LIMITS)
        }
        if (u.includes('/api/v1/accountActiveOrders')) {
          return respond(ACTIVE_ORDERS)
        }
        if (u.includes('/api/v1/accountInactiveOrders')) {
          return respond({ code: 0, orders: [], next_cursor: '' })
        }
        if (u.includes('/api/v1/trades')) {
          return respond(TRADES)
        }
        if (u.includes('/api/v1/account?')) {
          return respond(ACCOUNT_PAYLOAD)
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )

    const provider = lighterProvider({ authToken: 'read-token' })
    provider.bind(STUB_CLIENT)
    reads = {
      account: await provider.getAccount({ address: ADDRESS }),
      withdrawable: {
        rows: await provider.getWithdrawableBalances?.({ address: ADDRESS }),
      },
      availableToTrade: await provider.getAvailableToTrade?.({
        address: ADDRESS,
        marketId: String(BTC_MARKET_ID),
      }),
      positions: await provider.getPositions({ address: ADDRESS }),
      orders: await provider.getOrders({ address: ADDRESS }),
      fills: await provider.getFills({ address: ADDRESS }),
    }
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  const cases: [string, keyof typeof reads, string[]][] = [
    ['getAccount', 'account', ACCOUNT_PATHS],
    ['getWithdrawableBalances', 'withdrawable', WITHDRAWABLE_PATHS],
    ['getAvailableToTrade', 'availableToTrade', AVAILABLE_TO_TRADE_PATHS],
    ['getPositions', 'positions', POSITIONS_PATHS],
    ['getOrders', 'orders', ORDER_PATHS],
    ['getFills', 'fills', FILL_PATHS],
  ]

  for (const [label, key, paths] of cases) {
    describe(label, () => {
      it.each(paths)('spells %s as a decimal', (path) => {
        expectDecimalsAt(reads[key], path)
      })
    })
  }

  it('sets transferable on every spot balance row', () => {
    const rows = valuesAt(reads.account, 'balances[].transferable')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((value) => value === undefined)).toEqual([])
  })

  it('values a sub-micro spot mark without an exponent', () => {
    expect(valuesAt(reads.account, 'balances[].price')).toContain('0.0000005')
  })

  it.each(
    MARKET_CONTEXT_PATHS
  )('spells mapMarketContext %s as a decimal', (path) => {
    expectDecimalsAt(mapMarketContext(SUB_MICRO_STATS), path)
  })

  it('spells a sub-micro daily change and volume in plain notation', () => {
    const context = mapMarketContext(SUB_MICRO_STATS)
    expect(context.priceChange24h).toBe('0.0000001')
    expect(context.volume24h).toBe('0.0000005')
  })
})
