import { createMemoryStorage, type PerpsSDKClient } from '@lifi/perps-sdk'
import type { Provider } from '@lifi/perps-types'
import {
  isDecimalString,
  PositionMarginAdjustment,
  SigningMethod,
} from '@lifi/perps-types'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { OndoTokenStore } from './auth/OndoTokenStore.js'
import { ondoProvider } from './OndoProvider.js'
import type { OndoAuthToken } from './types/auth.js'
import type {
  OndoBalanceSummary,
  OndoFill,
  OndoOrder,
  OndoPosition,
} from './types/wire.js'

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

const ADDRESS = '0x2222222222222222222222222222222222222222' as const
const API_URL = 'https://api.ondoperps-sandbox.xyz'
const MARKET = 'ETH-USD.P'

const STUB_CLIENT = {
  config: { apiUrl: 'https://backend.test/v1/perps' },
} as PerpsSDKClient

const COLLATERAL_ASSET = {
  providerId: 'ondo',
  id: 'USDC',
  displaySymbol: 'USDC',
  displayName: 'USD Coin',
  logoURI: '',
}

const PROVIDER_METADATA: Provider = {
  key: 'ondo',
  name: 'Ondo',
  logoURI: '',
  signingMethod: SigningMethod.HMAC,
  active: true,
  setup: [],
  actions: [],
  supportedIntervals: [],
  categories: [{ id: 'ondo', quoteAsset: COLLATERAL_ASSET }],
}

const MARKETS_RESPONSE = {
  markets: [
    {
      providerId: 'ondo',
      id: MARKET,
      categoryId: 'ondo',
      baseAsset: {
        providerId: 'ondo',
        id: 'ETH',
        displaySymbol: 'ETH',
        logoURI: '',
      },
      quoteAsset: COLLATERAL_ASSET,
      szDecimals: 8,
      priceDecimals: 2,
      markPrice: '2500',
      maxLeverage: 20,
      onlyIsolated: false,
      positionMarginAdjustment: PositionMarginAdjustment.NONE,
      maintenanceMarginRate: 0.05,
      funding: { rate: '0.0000001', nextFundingTime: 0 },
    },
  ],
}

const nowSecs = () => Math.floor(Date.now() / 1000)

const AUTH_TOKEN: OndoAuthToken = {
  identifier: ADDRESS.toLowerCase(),
  authType: 'erc4361',
  accountId: 'acct-contract',
  issuedAtSecs: nowSecs() - 60,
  expirationSecs: nowSecs() + 3600,
  token: 'ondo-jwt-contract',
}

const ACCOUNT_INFO_RESULT = {
  accountID: 'acct-contract',
  identifier: ADDRESS.toLowerCase(),
  authType: 'erc4361',
  accountState: 'open',
  withdrawalFeeUSD: '0.5',
  termsVersion: 1,
  termsUnixSecs: 1_750_000_000,
  privacyVersion: 1,
  privacyUnixSecs: 1_750_000_000,
  marketingConsent: 'none',
}

const BALANCE: OndoBalanceSummary = {
  walletBalance: '5000',
  realizedPnl: '0',
  unrealizedPnl: '0.0000005',
  marginBalance: '5000.0000005',
  usedMargin: '900',
  availableMargin: '4100.0000005',
  withdrawableMargin: '4100.0000005',
  maintenanceMarginRequirement: '300',
  totalMaintenanceMargin: '300',
  marginRatio: '0.171',
  leverage: '3',
  underLiquidation: false,
  totalFundingPayments: '-0.0000001',
  totalTradingFees: '3',
  totalPnL: '0.0000005',
}

/** A sub-lot position, so a float hop would spell its size `5e-7`. */
const POSITION: OndoPosition = {
  market: MARKET,
  direction: 'long',
  netQuantity: '0.0000005',
  averageEntryPrice: '2400',
  usedMargin: '900',
  unrealizedPnl: '0.0000005',
  markPrice: '2500',
  liquidationPrice: '2050',
  bankruptcyPrice: '2020',
  maintenanceMargin: '300',
  notionalValue: '0.00125',
  leverage: '3',
  netFundingSinceNeutral: '-0.0000001',
  returnOnEquity: '0.278',
}

const ORDER: OndoOrder = {
  orderId: 'ord-1',
  side: 'buy',
  price: '2400',
  size: '0.0000005',
  market: MARKET,
  filledSize: '0.0000002',
  lastFillSize: '0.0000002',
  filledCost: '0.00048',
  fee: '0.0000001',
  status: 'open',
  createdAt: '2026-03-05T14:30:00Z',
  type: 'limit',
  timeInForce: 'GTC',
}

const FILL: OndoFill = {
  id: 'fill-1',
  orderId: 'ord-1',
  market: MARKET,
  price: '2400',
  size: '0.0000005',
  side: 'buy',
  filledCost: '0.0012',
  fee: '0.0000001',
  time: '2026-03-05T14:30:01Z',
  isMaker: false,
  pnl: '0.0000005',
}

const MAX_ORDER_SIZES = {
  percent100: { maxBidBaseSize: '0.0000005', maxAskBaseSize: '0.0000005' },
  percent75: { maxBidBaseSize: '0.0000003', maxAskBaseSize: '0.0000003' },
  percent50: { maxBidBaseSize: '0.0000002', maxAskBaseSize: '0.0000002' },
  percent25: { maxBidBaseSize: '0.0000001', maxAskBaseSize: '0.0000001' },
}

const respond = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

const envelope = <T>(result: T) => ({ success: true, result })

const page = <T>(result: T[]) => ({
  success: true,
  result,
  pageInfo: { hasNextPage: false },
})

describe('ondo emits a DecimalString on every typed field', () => {
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
        if (u.includes('backend.test/v1/perps/markets')) {
          return respond(MARKETS_RESPONSE)
        }
        if (u.includes('backend.test/v1/perps/assets')) {
          return respond({ assets: [COLLATERAL_ASSET] })
        }
        if (u.includes('backend.test/v1/perps/providers')) {
          return respond({ providers: [PROVIDER_METADATA] })
        }
        if (u.includes('/v1/perps/balance')) {
          return respond(envelope(BALANCE))
        }
        if (u.includes('/v1/perps/positions')) {
          return respond(envelope([POSITION]))
        }
        if (u.includes('/v1/perps/max_order_size')) {
          return respond(envelope(MAX_ORDER_SIZES))
        }
        if (u.includes('/v1/perps/leverage')) {
          return respond(envelope([{ market: MARKET, leverage: '3' }]))
        }
        if (u.includes('/v1/perps/mark_prices')) {
          return respond(envelope({ [MARKET]: { markPrice: '2500' } }))
        }
        if (u.includes('/v1/perps/twap/orders')) {
          return respond(page([]))
        }
        if (u.includes('/v1/perps/orders')) {
          return respond(page([ORDER]))
        }
        if (u.includes('/v1/perps/fills')) {
          return respond(page([FILL]))
        }
        if (u.includes('/v1/account/referral')) {
          return respond(envelope(null))
        }
        if (u.includes('/v1/wallet/deposit_address/list')) {
          return respond(envelope([]))
        }
        if (u.includes('/v1/account')) {
          return respond(envelope(ACCOUNT_INFO_RESULT))
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )

    const storage = createMemoryStorage()
    await new OndoTokenStore(storage, API_URL).set(ADDRESS, AUTH_TOKEN)
    const provider = ondoProvider({ apiUrl: API_URL, storage })
    provider.bind(STUB_CLIENT)
    reads = {
      account: await provider.getAccount({ address: ADDRESS }),
      withdrawable: {
        rows: await provider.getWithdrawableBalances?.({ address: ADDRESS }),
      },
      availableToTrade: await provider.getAvailableToTrade?.({
        address: ADDRESS,
        marketId: MARKET,
      }),
      positions: await provider.getPositions({ address: ADDRESS }),
      orders: await provider.getOrders({ address: ADDRESS }),
      fills: await provider.getFills({ address: ADDRESS }),
    }
  })

  afterEach(() => {
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

  // Ondo holds its collateral on the perps route only: it reports no spot
  // category, so `balances` is empty and `collateralBalances` carries the one
  // row that releases margin.
  it('sets transferable on every collateral balance row', () => {
    const rows = valuesAt(reads.account, 'collateralBalances[].transferable')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((value) => value === undefined)).toEqual([])
  })

  it('keeps a sub-micro position size in plain notation', () => {
    expect(valuesAt(reads.positions, 'positions[].size')).toContain('0.0000005')
  })
})
