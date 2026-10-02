import { createPerpsClient } from '@lifi/perps-sdk'
import {
  isDecimalString,
  type Market,
  type MarketContext,
} from '@lifi/perps-types'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  HL_CLEARINGHOUSE_STATE,
  HL_EXTRA_AGENTS,
  HL_FRONTEND_OPEN_ORDERS,
  HL_MARKETS,
  HL_SPOT_MARKET,
  HL_USER_FEES,
  HL_USER_FILLS,
  USDC_ASSET,
} from '../test/fixtures.js'
import { installInfoFetchMock } from '../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from './constants.js'
import { getAccount } from './services/getAccount.js'
import { getAvailableToTrade } from './services/getAvailableToTrade.js'
import { getFills } from './services/getFills.js'
import { getOrders } from './services/getOrders.js'
import { getPositions } from './services/getPositions.js'
import { getWithdrawableBalances } from './services/getWithdrawableBalances.js'
import type { HlSpotClearinghouseState } from './types/index.js'
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

const WITHDRAWABLE_PATHS = [
  'rows[].available',
  'rows[].max',
  'rows[].withdrawalFee',
]

const AVAILABLE_TO_TRADE_PATHS = ['buy', 'sell']

const MARKET_CONTEXT_PATHS = [
  'midPrice',
  'markPrice',
  'oraclePrice',
  'prevDayPrice',
  'priceChange24h',
  'volume24h',
  'marketCap',
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

const FILL_PATHS = [
  'items[].size',
  'items[].price',
  'items[].filledSize',
  'items[].realizedPnl',
  'items[].startPosition',
  'items[].fee.amount',
  'items[].builderFee.amount',
]

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'contract-test',
  apiKey: 'k',
  retry: false,
})
const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

/**
 * A spot token held at a price far below a cent, so a float spelling of the
 * unit price or its USD value would reach the output as `5e-7`.
 */
const SPOT_STATE: HlSpotClearinghouseState = {
  balances: [
    { coin: 'USDC', token: 0, total: '500', hold: '0', entryNtl: '0' },
    { coin: 'BTC', token: 142, total: '0.0000005', hold: '0', entryNtl: '0' },
  ],
  tokenToAvailableAfterMaintenance: [[0, '500']],
}

/** `@142` priced at `5e-7`, the sub-micro mark the spot balances value against. */
const SPOT_PRICE: MarketContext = {
  marketId: '@142',
  midPrice: '0.0000005',
  markPrice: '0.0000005',
}

/** `HL_SPOT_MARKET` keyed by the token index the spot balance carries. */
const SPOT_MARKET: Market = {
  ...HL_SPOT_MARKET,
  baseAsset: { ...HL_SPOT_MARKET.baseAsset, id: '142' },
}

const MARKETS = [...HL_MARKETS, SPOT_MARKET]

const RESPONSES = {
  userFees: HL_USER_FEES,
  userAbstraction: null,
  extraAgents: HL_EXTRA_AGENTS,
  spotClearinghouseState: SPOT_STATE,
  clearinghouseState: HL_CLEARINGHOUSE_STATE,
  frontendOpenOrders: HL_FRONTEND_OPEN_ORDERS,
  historicalOrders: [],
  twapHistory: [],
  userFills: HL_USER_FILLS,
  userFillsByTime: HL_USER_FILLS,
  activeAssetData: {
    user: ADDRESS.toLowerCase(),
    coin: 'BTC',
    leverage: { type: 'cross', value: 20 },
    maxTradeSzs: ['0.0003', '0.0003'],
    availableToTrade: ['431.749348', '182.319517'],
    markPx: '95000.0',
  },
}

/** A venue context whose funding rate sits at the `1e-7` boundary. */
const SUB_MICRO_CTX = {
  coin: 'BTC',
  funding: '0.0000001',
  openInterest: '0.0000005',
  dayNtlVlm: '50000',
  prevDayPx: '94000',
  markPx: '95000',
  midPx: null,
  oraclePx: '94999',
}

describe('hyperliquid emits a DecimalString on every typed field', () => {
  let restore: (() => void) | undefined
  let reads: {
    account: unknown
    withdrawable: unknown
    availableToTrade: unknown
    positions: unknown
    orders: unknown
    fills: unknown
  }

  beforeAll(async () => {
    ;({ restore } = installInfoFetchMock(
      RESPONSES,
      MARKETS,
      [SPOT_PRICE],
      [USDC_ASSET]
    ))
    reads = {
      account: await getAccount(ctx, { address: ADDRESS }),
      withdrawable: {
        rows: await getWithdrawableBalances(ctx, { address: ADDRESS }),
      },
      availableToTrade: await getAvailableToTrade(ctx, {
        address: ADDRESS,
        marketId: 'BTC',
      }),
      positions: await getPositions(ctx, { address: ADDRESS }),
      orders: await getOrders(ctx, { address: ADDRESS }),
      fills: await getFills(ctx, { address: ADDRESS }),
    }
  })

  afterEach(() => {
    restore?.()
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
        for (const value of valuesAt(reads[key], path)) {
          if (value == null) {
            continue
          }
          expect(isDecimalString(value), `${path} -> ${String(value)}`).toBe(
            true
          )
        }
      })

      it('reads at least one decimal, so the fixture is not empty', () => {
        const found = paths.flatMap((path) =>
          valuesAt(reads[key], path).filter((value) => value != null)
        )
        expect(found.length).toBeGreaterThan(0)
      })
    })
  }

  it('sets transferable on every spot balance row', () => {
    const rows = valuesAt(reads.account, 'balances[].transferable')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((value) => value === undefined)).toEqual([])
  })

  it('values a sub-micro spot mark without an exponent', () => {
    const prices = valuesAt(reads.account, 'balances[].price')
    expect(prices).toContain('0.0000005')
  })

  it.each(
    MARKET_CONTEXT_PATHS
  )('spells mapMarketContext %s as a decimal', (path) => {
    for (const value of valuesAt(
      mapMarketContext('BTC', SUB_MICRO_CTX),
      path
    )) {
      if (value == null) {
        continue
      }
      expect(isDecimalString(value), `${path} -> ${String(value)}`).toBe(true)
    }
  })

  it('keeps a sub-micro funding rate in plain notation', () => {
    expect(mapMarketContext('BTC', SUB_MICRO_CTX).funding?.rate).toBe(
      '0.0000001'
    )
  })
})
