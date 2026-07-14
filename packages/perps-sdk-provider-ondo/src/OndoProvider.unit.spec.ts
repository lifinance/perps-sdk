import {
  createMemoryStorage,
  PerpsError,
  type PerpsSDKClient,
} from '@lifi/perps-sdk'
import type {
  AccountResponse,
  HmacActionStep,
  HmacSignedActionStep,
  Position,
  ProviderAction,
} from '@lifi/perps-types'
import {
  ActionType,
  ActivityType,
  FillClassification,
  FillStatus,
  LiquidityRole,
  MarginMode,
  OrderSide,
  OrderStatus,
  OrderType,
  PerpsErrorCode,
  PerpsSigner,
  PositionSide,
  SigningMethod,
} from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hmacSignRequest } from './auth/hmac.js'
import { OndoApiKeyStore } from './auth/OndoApiKeyStore.js'
import { OndoTokenStore } from './auth/OndoTokenStore.js'
import { ondoProvider } from './OndoProvider.js'
import type { OndoApiKey, OndoAuthToken } from './types/auth.js'
import type {
  OndoBalanceSummary,
  OndoFill,
  OndoFundingFeeTransfer,
  OndoLiquidationEvent,
  OndoOrder,
  OndoPosition,
} from './types/wire.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ADDRESS = '0x1111111111111111111111111111111111111111' as const

const API_URL = 'https://api.ondoperps-sandbox.xyz'

const STUB_CLIENT = {
  config: { apiUrl: 'https://backend.test/v1/perps' },
} as PerpsSDKClient

const nowSecs = () => Math.floor(Date.now() / 1000)

const AUTH_TOKEN_EXPIRY = nowSecs() + 3600

const AUTH_TOKEN: OndoAuthToken = {
  identifier: ADDRESS.toLowerCase(),
  authType: 'erc4361',
  accountId: 'acct-1',
  issuedAtSecs: nowSecs() - 60,
  expirationSecs: AUTH_TOKEN_EXPIRY,
  token: 'ondo-jwt-token',
  newAccount: false,
}

const API_KEY: OndoApiKey = {
  keyId: 'key-1',
  apiSecret: 'super-secret',
  name: 'lifi-perps',
  createdAt: '2026-07-14T00:00:00.000Z',
  scopes: ['trade'],
}

const MARKETS_RESPONSE = {
  markets: [
    {
      providerId: 'ondo',
      id: 'AAPL-USD.P',
      categoryId: 'ondo',
      baseAsset: {
        providerId: 'ondo',
        id: 'AAPL',
        displaySymbol: 'AAPL',
        logoURI: '',
      },
      quoteAsset: {
        providerId: 'ondo',
        id: 'USD',
        displaySymbol: 'USD',
        logoURI: '',
      },
      szDecimals: 2,
      priceDecimals: 2,
      markPrice: '202.05',
      maxLeverage: 20,
      onlyIsolated: false,
      maintenanceMarginRate: 0.02,
      funding: { rate: '0.0001', nextFundingTime: 0 },
    },
  ],
}

const MARKET_DISPLAY = {
  providerId: 'ondo',
  id: 'AAPL-USD.P',
  categoryId: 'ondo',
  baseAsset: MARKETS_RESPONSE.markets[0].baseAsset,
  quoteAsset: MARKETS_RESPONSE.markets[0].quoteAsset,
}

const BALANCE_RESULT: OndoBalanceSummary = {
  walletBalance: '1000',
  realizedPnl: '25',
  unrealizedPnl: '15.5',
  marginBalance: '1015.5',
  usedMargin: '401',
  availableMargin: '614.5',
  withdrawableMargin: '599',
  maintenanceMarginRequirement: '40.1',
  totalMaintenanceMargin: '40.1',
  marginRatio: '0.039',
  leverage: '2',
  underLiquidation: false,
  totalFundingPayments: '-0.12',
  totalTradingFees: '1.2',
  totalPnL: '40.5',
}

const POSITION_RESULT: OndoPosition = {
  market: 'AAPL-USD.P',
  direction: 'long',
  netQuantity: '10',
  averageEntryPrice: '200.5',
  usedMargin: '401',
  unrealizedPnl: '15.5',
  markPrice: '202.05',
  liquidationPrice: '182.3',
  bankruptcyPrice: '180.5',
  maintenanceMargin: '40.1',
  notionalValue: '2020.5',
  leverage: '5',
  netFundingSinceNeutral: '-0.12',
  returnOnEquity: '0.038',
}

const ORDER_OPEN: OndoOrder = {
  orderId: 'ord-1',
  side: 'buy',
  price: '200',
  size: '10',
  market: 'AAPL-USD.P',
  filledSize: '4',
  lastFillSize: '4',
  filledCost: '802',
  fee: '0.4',
  status: 'open',
  createdAt: '2026-07-01T12:00:00Z',
  type: 'limit',
  timeInForce: 'GTC',
  reduceOnly: false,
}

const ORDER_UNTRIGGERED: OndoOrder = {
  orderId: 'ord-2',
  side: 'sell',
  price: '0',
  size: '10',
  market: 'AAPL-USD.P',
  filledSize: '0',
  lastFillSize: '0',
  filledCost: '0',
  fee: '0',
  status: 'untriggered',
  createdAt: '2026-07-01T12:05:00Z',
  type: 'stopMarket',
  stopOrderType: 'stopLoss',
  triggerPrice: '190',
  reduceOnly: true,
}

const ORDER_CANCELED: OndoOrder = {
  orderId: 'ord-3',
  side: 'buy',
  price: '195',
  size: '1',
  market: 'AAPL-USD.P',
  filledSize: '0',
  lastFillSize: '0',
  filledCost: '0',
  fee: '0',
  status: 'canceled',
  createdAt: '2026-07-01T11:00:00Z',
  canceledAt: '2026-07-01T11:30:00Z',
  cancelReason: 'user',
  type: 'limit',
  timeInForce: 'GTC',
}

const FILL_RESULT: OndoFill = {
  id: 'fill-1',
  orderId: 'ord-1',
  market: 'AAPL-USD.P',
  price: '200.5',
  size: '4',
  side: 'buy',
  filledCost: '802',
  fee: '0.4',
  time: '2026-07-01T12:01:00Z',
  isMaker: false,
  direction: 'openLong',
  feeRebate: '0.1',
}

const FUNDING_RESULT: OndoFundingFeeTransfer = {
  market: 'AAPL-USD.P',
  time: '2026-07-01T12:00:00Z',
  markPrice: '202.05',
  positionSize: '10',
  positionDirection: 'long',
  rate: '0.0001',
  payer: 'long',
  amount: '-0.12',
}

const LIQUIDATION_RESULT: OndoLiquidationEvent = {
  id: 'liq-1',
  time: '2026-07-01T14:00:00Z',
  initiatedAt: '2026-07-01T13:59:58Z',
  accountId: 'acct-1',
  status: 'stop',
  insuranceFundUsed: '0',
  adl: false,
  retryCount: 0,
  triggeringPositions: [POSITION_RESULT],
  filledQuoteSize: '1820',
  filledQuantity: '10',
}

const ACCOUNT_INFO_RESULT = {
  accountID: 'acct-1',
  identifier: ADDRESS.toLowerCase(),
  authType: 'erc4361',
  accountState: 'open',
  withdrawalFeeUSD: '0',
  termsVersion: 1,
  termsUnixSecs: 1_750_000_000,
  privacyVersion: 1,
  privacyUnixSecs: 1_750_000_000,
  marketingConsent: 'none',
}

// ---------------------------------------------------------------------------
// fetch mock setup
// ---------------------------------------------------------------------------

interface Recorded {
  url: string
  init?: RequestInit
}

let recorded: Recorded[] = []
let fetchMock: ReturnType<typeof vi.fn>
/** `GET /v1/account/referral` result; `null` mirrors an unreferred account. */
let referralResult: { code: string; rebate?: number } | null

const respond = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const envelope = <T>(result: T) => ({ success: true, result })

beforeEach(() => {
  recorded = []
  referralResult = { code: 'K04HBJ', rebate: 0.1 }
  fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('backend.test/v1/perps/markets')) {
      return respond(MARKETS_RESPONSE)
    }
    recorded.push({ url: u, init })
    if (u.includes('/v1/perps/balance')) {
      return respond(envelope(BALANCE_RESULT))
    }
    if (u.includes('/v1/perps/positions')) {
      return respond(envelope([POSITION_RESULT]))
    }
    if (u.includes('/v1/perps/orders/')) {
      return respond(envelope(ORDER_OPEN))
    }
    if (u.includes('/v1/perps/orders')) {
      return respond({
        success: true,
        result: [ORDER_OPEN, ORDER_UNTRIGGERED, ORDER_CANCELED],
        pageInfo: { nextCursor: 'orders-cur-2' },
      })
    }
    if (u.includes('/v1/perps/fills')) {
      return respond({
        success: true,
        result: [FILL_RESULT],
        pageInfo: { nextCursor: 'fills-cur-2' },
      })
    }
    if (u.includes('/v1/perps/funding_fees')) {
      return respond({
        success: true,
        result: [FUNDING_RESULT],
      })
    }
    if (u.includes('/v1/perps/liquidation_history')) {
      return respond({
        success: true,
        result: [LIQUIDATION_RESULT],
      })
    }
    if (u.includes('/v1/account/referral')) {
      return respond(envelope(referralResult))
    }
    if (u.includes('/v1/account')) {
      return respond(envelope(ACCOUNT_INFO_RESULT))
    }
    throw new Error(`Unhandled URL in test: ${u}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Provider construction helpers
// ---------------------------------------------------------------------------

/** A provider with a valid session token seeded into its (shared) storage. */
const loggedInProvider = async () => {
  const storage = createMemoryStorage()
  const store = new OndoTokenStore(storage, API_URL)
  await store.set(ADDRESS, AUTH_TOKEN)
  const provider = ondoProvider({ apiUrl: API_URL, storage })
  provider.bind(STUB_CLIENT)
  return { provider, store, storage }
}

const loggedOutProvider = () => {
  const provider = ondoProvider({
    apiUrl: API_URL,
    storage: createMemoryStorage(),
  })
  provider.bind(STUB_CLIENT)
  return provider
}

const authHeaderOf = (r: Recorded) =>
  new Headers(r.init?.headers).get('authorization')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OndoProvider — `type` field', () => {
  it('reports `ondo` as the provider key', () => {
    const provider = ondoProvider()
    expect(provider.type).toBe('ondo')
  })
})

describe('OndoProvider — order formatting and liquidation surface', () => {
  const market = MARKETS_RESPONSE.markets[0]

  it('formats prices half-up and sizes truncated against the market decimals', () => {
    const provider = ondoProvider()
    expect(provider.formatOrderPrice(market, 201.555)).toBe('201.56')
    expect(provider.formatOrderSize(market, 0.129)).toBe('0.12')
  })

  it('estimates liquidation from the market maintenanceMarginRate', () => {
    const provider = ondoProvider()
    // entry * (1 - 1/leverage) / (1 - mmr) = 200 * 0.8 / 0.98
    const liq = provider.estimateLiquidationPrice(market, {
      entryPrice: 200,
      leverage: 5,
      isLong: true,
    })
    expect(liq).toBeCloseTo(163.265, 2)
  })
})

describe('OndoProvider — logged-out degrade paths', () => {
  it('getAccount returns an empty snapshot with a loggedIn: false config', async () => {
    const provider = loggedOutProvider()
    const account = await provider.getAccount({ address: ADDRESS })
    expect(account).toEqual({
      provider: 'ondo',
      address: ADDRESS,
      balances: [],
      collateralBalances: [],
      positions: [],
      marginUsed: '0',
      unrealizedPnl: '0',
      feeTier: { maker: '0.0002', taker: '0.0005' },
      config: {
        provider: 'ondo',
        loggedIn: false,
        termsAccepted: false,
        apiKeyRegistered: false,
        referralSet: false,
      },
    })
    expect(recorded).toHaveLength(0)
  })

  it('getPositions / getOrders / getFills / getActivity return empty pages without venue calls', async () => {
    const provider = loggedOutProvider()

    const positions = await provider.getPositions({ address: ADDRESS })
    expect(positions.positions).toEqual([])
    expect(positions.pagination).toEqual({ limit: 0, hasMore: false })

    const orders = await provider.getOrders({ address: ADDRESS })
    expect(orders.openOrders).toEqual([])
    expect(orders.triggerOrders).toEqual([])

    const fills = await provider.getFills({ address: ADDRESS, limit: 5 })
    expect(fills.items).toEqual([])
    expect(fills.pagination).toEqual({ limit: 5, hasMore: false })

    const activity = await provider.getActivity({ address: ADDRESS })
    expect(activity.items).toEqual([])

    expect(recorded).toHaveLength(0)
  })

  it('getOrder throws when no session token is stored', async () => {
    const provider = loggedOutProvider()
    await expect(
      provider.getOrder({ address: ADDRESS, id: 'ord-1' })
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
  })

  it('accountExists resolves false without a venue call', async () => {
    const provider = loggedOutProvider()
    await expect(provider.accountExists({ address: ADDRESS })).resolves.toBe(
      false
    )
    expect(recorded).toHaveLength(0)
  })
})

describe('OndoProvider — getAccount (logged in)', () => {
  it('maps the balance summary and positions, exposing the session expiry in config', async () => {
    const { provider } = await loggedInProvider()
    const account = await provider.getAccount({ address: ADDRESS })

    expect(account.provider).toBe('ondo')
    expect(account.address).toBe(ADDRESS)
    expect(account.balances).toEqual([])
    expect(account.collateralBalances).toEqual([
      {
        categoryId: 'ondo',
        asset: expect.objectContaining({ displaySymbol: 'USD' }),
        units: '1000',
        valueUsd: '1000',
      },
    ])
    expect(account.marginUsed).toBe('401')
    expect(account.unrealizedPnl).toBe('15.5')
    expect(account.feeTier).toEqual({ maker: '0.0002', taker: '0.0005' })
    expect(account.config).toEqual({
      provider: 'ondo',
      loggedIn: true,
      authTokenExpiry: AUTH_TOKEN_EXPIRY,
      termsAccepted: true,
      apiKeyRegistered: false,
      referralSet: true,
    })
    expect(account.positions).toEqual([
      {
        market: MARKET_DISPLAY,
        side: PositionSide.LONG,
        size: '10',
        entryPrice: '200.5',
        markPrice: '202.05',
        liquidationPrice: '182.3',
        unrealizedPnl: '15.5',
        leverage: 5,
        marginUsed: '401',
        marginMode: MarginMode.CROSS,
      },
    ])

    const venueCalls = recorded.filter((r) => r.url.startsWith(API_URL))
    expect(venueCalls.length).toBeGreaterThanOrEqual(3)
    for (const call of venueCalls) {
      expect(authHeaderOf(call)).toBe('Bearer ondo-jwt-token')
    }
    expect(
      venueCalls.some((r) => r.url === `${API_URL}/v1/account/referral`)
    ).toBe(true)
  })

  it('reports referralSet: false when no referral is applied to the account', async () => {
    referralResult = null
    const { provider } = await loggedInProvider()
    const account = await provider.getAccount({ address: ADDRESS })
    expect(account.config).toEqual({
      provider: 'ondo',
      loggedIn: true,
      authTokenExpiry: AUTH_TOKEN_EXPIRY,
      termsAccepted: true,
      apiKeyRegistered: false,
      referralSet: false,
    })
  })

  it('reports apiKeyRegistered from local key presence, logged in or out', async () => {
    const { provider, storage } = await loggedInProvider()
    await new OndoApiKeyStore(storage, API_URL).set(ADDRESS, API_KEY)

    const loggedIn = await provider.getAccount({ address: ADDRESS })
    expect(loggedIn.config).toMatchObject({ apiKeyRegistered: true })

    const keyOnlyStorage = createMemoryStorage()
    await new OndoApiKeyStore(keyOnlyStorage, API_URL).set(ADDRESS, API_KEY)
    const loggedOut = ondoProvider({ apiUrl: API_URL, storage: keyOnlyStorage })
    loggedOut.bind(STUB_CLIENT)
    const account = await loggedOut.getAccount({ address: ADDRESS })
    expect(account.config).toMatchObject({
      loggedIn: false,
      apiKeyRegistered: true,
    })
  })

  it('reports termsAccepted: false while the session token still carries newAccount', async () => {
    const storage = createMemoryStorage()
    await new OndoTokenStore(storage, API_URL).set(ADDRESS, {
      ...AUTH_TOKEN,
      newAccount: true,
    })
    const provider = ondoProvider({ apiUrl: API_URL, storage })
    provider.bind(STUB_CLIENT)

    const account = await provider.getAccount({ address: ADDRESS })
    expect(account.config).toMatchObject({
      loggedIn: true,
      termsAccepted: false,
    })
  })

  it('evicts the stored token and returns the logged-out snapshot when the venue rejects it', async () => {
    const { provider, store } = await loggedInProvider()
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_RESPONSE)
      }
      return respond({ success: false, error: 'token expired' }, 401)
    })

    const account = await provider.getAccount({ address: ADDRESS })
    expect(account).toEqual({
      provider: 'ondo',
      address: ADDRESS,
      balances: [],
      collateralBalances: [],
      positions: [],
      marginUsed: '0',
      unrealizedPnl: '0',
      feeTier: { maker: '0.0002', taker: '0.0005' },
      config: {
        provider: 'ondo',
        loggedIn: false,
        termsAccepted: false,
        apiKeyRegistered: false,
        referralSet: false,
      },
    })
    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })

  it('propagates non-session venue errors and keeps the stored token', async () => {
    const { provider, store } = await loggedInProvider()
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_RESPONSE)
      }
      return respond({ success: false, error: 'venue exploded' }, 500)
    })

    await expect(
      provider.getAccount({ address: ADDRESS })
    ).rejects.toThrowError(/Ondo API request failed/)
    await expect(store.get(ADDRESS)).resolves.toEqual(AUTH_TOKEN)
  })
})

describe('OndoProvider — accountExists (logged in)', () => {
  it('returns true when /v1/account resolves', async () => {
    const { provider } = await loggedInProvider()
    await expect(provider.accountExists({ address: ADDRESS })).resolves.toBe(
      true
    )
    const call = recorded.find((r) => r.url.includes('/v1/account'))
    expect(call).toBeDefined()
    expect(authHeaderOf(call as Recorded)).toBe('Bearer ondo-jwt-token')
  })

  it('evicts the stored token and returns false when the venue rejects it', async () => {
    const { provider, store } = await loggedInProvider()
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_RESPONSE)
      }
      return respond({ success: false, error: 'token expired' }, 401)
    })

    await expect(provider.accountExists({ address: ADDRESS })).resolves.toBe(
      false
    )
    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })
})

describe('OndoProvider — getOrders', () => {
  it('classifies venue orders into open and trigger orders and pages on nextCursor', async () => {
    const { provider } = await loggedInProvider()
    const orders = await provider.getOrders({
      address: ADDRESS,
      marketId: 'AAPL-USD.P',
      limit: 10,
      cursor: 'orders-cur-1',
    })

    expect(orders.provider).toBe('ondo')
    expect(orders.openOrders).toEqual([
      {
        orderId: 'ord-1',
        market: MARKET_DISPLAY,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        size: '10',
        price: '200',
        filledSize: '4',
        reduceOnly: false,
        createdAt: '2026-07-01T12:00:00.000Z',
      },
    ])
    expect(orders.triggerOrders).toEqual([
      {
        orderId: 'ord-2',
        market: MARKET_DISPLAY,
        type: OrderType.STOP_MARKET,
        size: '10',
        triggerPrice: '190',
        createdAt: '2026-07-01T12:05:00.000Z',
      },
    ])
    expect(orders.pagination).toEqual({
      limit: 10,
      hasMore: true,
      cursor: 'orders-cur-2',
    })

    const call = recorded.find((r) => r.url.includes('/v1/perps/orders'))
    expect(call?.url).toContain('market=AAPL-USD.P')
    expect(call?.url).toContain('limit=10')
    expect(call?.url).toContain('cursor=orders-cur-1')
    expect(authHeaderOf(call as Recorded)).toBe('Bearer ondo-jwt-token')
  })
})

describe('OndoProvider — getOrder', () => {
  it('fetches the order by id and maps the full Order detail', async () => {
    const { provider } = await loggedInProvider()
    const order = await provider.getOrder({ address: ADDRESS, id: 'ord-1' })

    expect(order).toEqual({
      orderId: 'ord-1',
      market: MARKET_DISPLAY,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: '200',
      originalSize: '10',
      remainingSize: '6',
      filledSize: '4',
      timeInForce: 'GTC',
      reduceOnly: false,
      isTrigger: false,
      status: OrderStatus.OPEN,
      averagePrice: '200.5',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-01T12:00:00.000Z',
    })

    const call = recorded.find((r) => r.url.includes('/v1/perps/orders/ord-1'))
    expect(call).toBeDefined()
  })
})

describe('OndoProvider — getFills', () => {
  it('maps venue fills, netting the fee rebate, and pages on nextCursor', async () => {
    const { provider } = await loggedInProvider()
    const fills = await provider.getFills({ address: ADDRESS, limit: 20 })

    expect(fills.items).toEqual([
      {
        id: 'fill-1',
        orderId: 'ord-1',
        market: MARKET_DISPLAY,
        side: OrderSide.BUY,
        size: '4',
        price: '200.5',
        status: FillStatus.FILLED,
        liquidity: LiquidityRole.TAKER,
        fee: '0.3',
        realizedPnl: undefined,
        classification: FillClassification.OPENED_LONG,
        createdAt: '2026-07-01T12:01:00.000Z',
      },
    ])
    expect(fills.pagination).toEqual({
      limit: 20,
      hasMore: true,
      cursor: 'fills-cur-2',
    })
  })
})

describe('OndoProvider — getActivity', () => {
  it('merges funding and liquidation histories newest-first', async () => {
    const { provider } = await loggedInProvider()
    const activity = await provider.getActivity({ address: ADDRESS })

    expect(activity.items.map((i) => i.type)).toEqual([
      ActivityType.LIQUIDATION,
      ActivityType.FUNDING,
    ])
    expect(activity.items[0]).toMatchObject({
      id: 'liq-1',
      liquidatedNotionalPosition: '1820',
      liquidatedPositions: [{ market: MARKET_DISPLAY, size: '10' }],
    })
    expect(activity.items[1]).toMatchObject({
      id: 'funding:AAPL-USD.P:2026-07-01T12:00:00.000Z',
      amount: '-0.12',
      fundingRate: '0.0001',
    })
    expect(activity.pagination.hasMore).toBe(false)
  })

  it('emits a base64url cursor carrying the overflow when limit < merged count', async () => {
    const { provider } = await loggedInProvider()
    const first = await provider.getActivity({ address: ADDRESS, limit: 1 })

    expect(first.items).toHaveLength(1)
    expect(first.items[0]?.type).toBe(ActivityType.LIQUIDATION)
    expect(first.pagination.hasMore).toBe(true)
    expect(first.pagination.cursor).toBeTypeOf('string')

    const second = await provider.getActivity({
      address: ADDRESS,
      limit: 1,
      cursor: first.pagination.cursor,
    })
    expect(second.items[0]?.type).toBe(ActivityType.FUNDING)
  })

  it('filters to the requested activity types', async () => {
    const { provider } = await loggedInProvider()
    const activity = await provider.getActivity({
      address: ADDRESS,
      type: [ActivityType.FUNDING],
    })
    expect(activity.items).toHaveLength(1)
    expect(activity.items[0]?.type).toBe(ActivityType.FUNDING)
  })
})

describe('OndoProvider — server-revoked session', () => {
  // A JWT the server revoked before it locally expired: `tokenStore.get`
  // returns it, but the venue answers 401 → `OndoSessionExpiredError`. Every
  // authenticated read must evict the stale token and degrade gracefully so
  // the UI cannot soft-lock behind a token that still looks valid locally.
  const revokeSession = () =>
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_RESPONSE)
      }
      return respond({ success: false, error: 'token expired' }, 401)
    })

  it('getPositions evicts the token and returns an empty page', async () => {
    const { provider, store } = await loggedInProvider()
    revokeSession()

    await expect(provider.getPositions({ address: ADDRESS })).resolves.toEqual({
      provider: 'ondo',
      positions: [],
      pagination: { limit: 0, hasMore: false },
    })
    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })

  it('getOrders evicts the token and returns an empty page', async () => {
    const { provider, store } = await loggedInProvider()
    revokeSession()

    await expect(provider.getOrders({ address: ADDRESS })).resolves.toEqual({
      provider: 'ondo',
      openOrders: [],
      triggerOrders: [],
      pagination: { limit: 0, hasMore: false },
    })
    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })

  it('getOrder evicts the token and throws the session-required error', async () => {
    const { provider, store } = await loggedInProvider()
    revokeSession()

    await expect(
      provider.getOrder({ address: ADDRESS, id: 'ord-1' })
    ).rejects.toThrowError(/requires a session token/)
    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })

  it('getFills evicts the token and returns an empty page', async () => {
    const { provider, store } = await loggedInProvider()
    revokeSession()

    await expect(
      provider.getFills({ address: ADDRESS, limit: 5 })
    ).resolves.toEqual({
      provider: 'ondo',
      items: [],
      pagination: { limit: 5, hasMore: false },
    })
    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })

  it('getActivity evicts the token and returns an empty page', async () => {
    const { provider, store } = await loggedInProvider()
    revokeSession()

    await expect(provider.getActivity({ address: ADDRESS })).resolves.toEqual({
      provider: 'ondo',
      items: [],
      pagination: { limit: 0, hasMore: false },
    })
    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })

  it('propagates non-session venue errors and keeps the token', async () => {
    const { provider, store } = await loggedInProvider()
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_RESPONSE)
      }
      return respond({ success: false, error: 'venue exploded' }, 500)
    })

    await expect(
      provider.getPositions({ address: ADDRESS })
    ).rejects.toThrowError(/Ondo API request failed/)
    await expect(store.get(ADDRESS)).resolves.toEqual(AUTH_TOKEN)
  })
})

describe('OndoProvider — getAccountSummary', () => {
  it('treats collateral rows as gross (locked margin included, uPnL from positions)', () => {
    const provider = ondoProvider()
    const account = {
      provider: 'ondo',
      address: ADDRESS,
      balances: [],
      collateralBalances: [
        {
          categoryId: 'ondo',
          asset: MARKETS_RESPONSE.markets[0].quoteAsset,
          units: '1000',
          valueUsd: '1000',
        },
      ],
      positions: [],
      marginUsed: '401',
      unrealizedPnl: '15.5',
      feeTier: { maker: '0.0002', taker: '0.0005' },
      config: {
        provider: 'ondo',
        loggedIn: true,
        termsAccepted: true,
        apiKeyRegistered: true,
        referralSet: true,
      } as const,
    } satisfies AccountResponse
    const positions: Position[] = [
      {
        market: MARKET_DISPLAY,
        side: PositionSide.LONG,
        size: '10',
        entryPrice: '200.5',
        markPrice: '202.05',
        liquidationPrice: '182.3',
        unrealizedPnl: '15.5',
        leverage: 5,
        marginUsed: '401',
        marginMode: MarginMode.CROSS,
      },
    ]

    expect(provider.getAccountSummary(account, positions)).toEqual({
      portfolioValue: '1015.5',
      availableMargin: '614.5',
      marginUsed: '401',
      unrealizedPnl: '15.5',
    })
  })
})

describe('OndoProvider — projectConfig', () => {
  const SIWE_DESCRIPTOR: ProviderAction = {
    type: ActionType.SIWE_LOGIN,
    signers: [PerpsSigner.USER],
    signingMethod: SigningMethod.SIWE,
  }
  const REFERRAL_DESCRIPTOR: ProviderAction = {
    type: ActionType.SET_REFERRAL,
    signers: [PerpsSigner.USER],
    signingMethod: SigningMethod.HMAC,
  }
  const TERMS_DESCRIPTOR: ProviderAction = {
    type: ActionType.ACCEPT_PROVIDER_TERMS,
    signers: [PerpsSigner.USER],
    signingMethod: SigningMethod.SESSION,
  }
  const REGISTER_KEY_DESCRIPTOR: ProviderAction = {
    type: ActionType.REGISTER_API_KEY,
    signers: [PerpsSigner.USER],
    signingMethod: SigningMethod.SESSION,
  }

  const loggedOutConfig = {
    provider: 'ondo',
    loggedIn: false,
    termsAccepted: false,
    apiKeyRegistered: false,
    referralSet: false,
  } as const

  it('projects SIWE_LOGIN with the session expiry when logged in', () => {
    const provider = ondoProvider()
    expect(
      provider.projectConfig(
        {
          provider: 'ondo',
          loggedIn: true,
          authTokenExpiry: AUTH_TOKEN_EXPIRY,
          termsAccepted: true,
          apiKeyRegistered: false,
          referralSet: false,
        },
        [SIWE_DESCRIPTOR],
        []
      )
    ).toEqual([
      {
        type: ActionType.SIWE_LOGIN,
        values: [{ name: 'authTokenExpiry', value: AUTH_TOKEN_EXPIRY }],
        satisfied: true,
      },
    ])
  })

  it('projects SIWE_LOGIN as unsatisfied with a null expiry when logged out', () => {
    const provider = ondoProvider()
    expect(
      provider.projectConfig(loggedOutConfig, [SIWE_DESCRIPTOR], [])
    ).toEqual([
      {
        type: ActionType.SIWE_LOGIN,
        values: [{ name: 'authTokenExpiry', value: null }],
        satisfied: false,
      },
    ])
  })

  it('projects ACCEPT_PROVIDER_TERMS satisfaction from termsAccepted', () => {
    const provider = ondoProvider()
    expect(
      provider.projectConfig(
        { ...loggedOutConfig, loggedIn: true, termsAccepted: true },
        [TERMS_DESCRIPTOR],
        []
      )
    ).toEqual([
      { type: ActionType.ACCEPT_PROVIDER_TERMS, values: [], satisfied: true },
    ])
    expect(
      provider.projectConfig(loggedOutConfig, [TERMS_DESCRIPTOR], [])
    ).toEqual([
      { type: ActionType.ACCEPT_PROVIDER_TERMS, values: [], satisfied: false },
    ])
  })

  it('projects REGISTER_API_KEY satisfaction from apiKeyRegistered', () => {
    const provider = ondoProvider()
    expect(
      provider.projectConfig(
        { ...loggedOutConfig, apiKeyRegistered: true },
        [REGISTER_KEY_DESCRIPTOR],
        []
      )
    ).toEqual([
      { type: ActionType.REGISTER_API_KEY, values: [], satisfied: true },
    ])
    expect(
      provider.projectConfig(loggedOutConfig, [REGISTER_KEY_DESCRIPTOR], [])
    ).toEqual([
      { type: ActionType.REGISTER_API_KEY, values: [], satisfied: false },
    ])
  })

  it('projects SET_REFERRAL satisfaction from referralSet', () => {
    const provider = ondoProvider()
    expect(
      provider.projectConfig(
        {
          provider: 'ondo',
          loggedIn: true,
          authTokenExpiry: AUTH_TOKEN_EXPIRY,
          termsAccepted: true,
          apiKeyRegistered: true,
          referralSet: true,
        },
        [SIWE_DESCRIPTOR, REFERRAL_DESCRIPTOR],
        []
      )
    ).toEqual([
      {
        type: ActionType.SIWE_LOGIN,
        values: [{ name: 'authTokenExpiry', value: AUTH_TOKEN_EXPIRY }],
        satisfied: true,
      },
      {
        type: ActionType.SET_REFERRAL,
        values: [],
        satisfied: true,
      },
    ])
    expect(
      provider.projectConfig(loggedOutConfig, [REFERRAL_DESCRIPTOR], [])
    ).toEqual([
      {
        type: ActionType.SET_REFERRAL,
        values: [],
        satisfied: false,
      },
    ])
  })

  it('throws SDKError on a non-ondo config or an unknown descriptor', () => {
    const provider = ondoProvider()
    expect(() =>
      provider.projectConfig(
        { provider: 'hyperliquid', abstractionMode: null, agents: [] },
        [SIWE_DESCRIPTOR],
        []
      )
    ).toThrowError(PerpsError)
    expect(() =>
      provider.projectConfig(
        loggedOutConfig,
        [{ ...SIWE_DESCRIPTOR, type: ActionType.PLACE_ORDER }],
        []
      )
    ).toThrowError(PerpsError)
  })
})

describe('OndoProvider — write-action surface', () => {
  const PLACE_ORDER_STEP: HmacActionStep = {
    action: ActionType.PLACE_ORDER,
    request: {
      method: 'POST',
      path: '/v1/perps/orders',
      body: '{"market":"AAPL-USD.P","side":"buy","size":"1","type":"market"}',
    },
  }

  it('signActions(HMAC) HMAC-signs each step with the stored API key', async () => {
    const { provider, storage } = await loggedInProvider()
    await new OndoApiKeyStore(storage, API_URL).set(ADDRESS, API_KEY)

    const signed = (await provider.signActions?.(
      SigningMethod.HMAC,
      [PLACE_ORDER_STEP],
      ADDRESS
    )) as HmacSignedActionStep[]

    const [step] = signed
    expect(step.action).toBe(ActionType.PLACE_ORDER)
    expect(step.request).toEqual(PLACE_ORDER_STEP.request)
    expect(step.hmac.keyId).toBe(API_KEY.keyId)

    const { timestampMs } = step.hmac
    const expected = await hmacSignRequest(API_KEY.apiSecret, {
      timestampMs,
      method: PLACE_ORDER_STEP.request.method,
      pathWithQuery: PLACE_ORDER_STEP.request.path,
      body: PLACE_ORDER_STEP.request.body,
    })
    expect(step.hmac.signature).toBe(expected)
    // The API secret never appears in the signed step — only the signature.
    expect(JSON.stringify(step.hmac)).not.toContain(API_KEY.apiSecret)
  })

  it('signActions(HMAC) mints a key on first use, JWT-authorized', async () => {
    const { provider } = await loggedInProvider()
    fetchMock.mockImplementationOnce(async (url: string | URL) => {
      expect(String(url)).toBe(`${API_URL}/v1/api_keys`)
      return respond(envelope(API_KEY))
    })

    const signed = (await provider.signActions?.(
      SigningMethod.HMAC,
      [PLACE_ORDER_STEP],
      ADDRESS
    )) as HmacSignedActionStep[]

    expect(signed[0].hmac.keyId).toBe(API_KEY.keyId)
  })
})

describe('OndoProvider — onExecuteResults key eviction', () => {
  it('evicts the stored API key when a result fails with Unauthorized', async () => {
    const { provider, storage } = await loggedInProvider()
    const keyStore = new OndoApiKeyStore(storage, API_URL)
    await keyStore.set(ADDRESS, API_KEY)

    await provider.onExecuteResults?.(ADDRESS, [
      {
        action: ActionType.PLACE_ORDER,
        success: false,
        error: 'API key not found',
        errorCode: PerpsErrorCode.Unauthorized,
      },
    ])

    await expect(keyStore.get(ADDRESS)).resolves.toBeNull()
  })

  it('keeps the stored API key on success and on non-Unauthorized failures', async () => {
    const { provider, storage } = await loggedInProvider()
    const keyStore = new OndoApiKeyStore(storage, API_URL)
    await keyStore.set(ADDRESS, API_KEY)

    await provider.onExecuteResults?.(ADDRESS, [
      { action: ActionType.PLACE_ORDER, success: true },
      {
        action: ActionType.PLACE_ORDER,
        success: false,
        error: 'insufficient margin',
        errorCode: PerpsErrorCode.InsufficientMargin,
      },
      { action: ActionType.PLACE_ORDER, success: false, error: 'opaque' },
    ])

    await expect(keyStore.get(ADDRESS)).resolves.toEqual(API_KEY)
  })
})

describe('OndoProvider — direct-REST base URL', () => {
  it('hits Ondo production by default', async () => {
    const storage = createMemoryStorage()
    const store = new OndoTokenStore(storage, 'https://api.ondoperps.xyz')
    await store.set(ADDRESS, AUTH_TOKEN)
    const provider = ondoProvider({ storage })
    provider.bind(STUB_CLIENT)

    await provider.accountExists({ address: ADDRESS })
    const call = recorded.find((r) => r.url.includes('/v1/account'))
    expect(call?.url).toBe('https://api.ondoperps.xyz/v1/account')
  })
})
