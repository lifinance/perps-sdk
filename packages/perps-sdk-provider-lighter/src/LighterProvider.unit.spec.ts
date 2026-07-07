import {
  createMemoryStorage,
  PerpsError,
  type PerpsSDKClient,
} from '@lifi/perps-sdk'
import {
  ActivityType,
  LiquidityRole,
  OrderSide,
  PerpsErrorCode,
} from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIGHTER_CODE_ACCOUNT_NOT_FOUND } from './constants.js'
import { lighterProvider } from './LighterProvider.js'
import { LighterKeyStore } from './signers/LighterKeyStore.js'
import type { LighterSigner } from './signers/LighterSigner.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ADDRESS = '0x1111111111111111111111111111111111111111' as const

/** Year ~2096 in unix seconds — a read-only token expiry far past any test clock. */
const FAR_EXPIRY_SECONDS = 4_000_000_000

// Lighter account-level methods call backend `/perps/markets?provider=lighter`
// to source the `market_id → displaySymbol` lookup, and `/perps/assets` for the
// token registry. Stub a backend apiUrl against which the fetch mock can match.
const STUB_CLIENT = {
  config: { apiUrl: 'https://backend.test/v1/perps' },
} as PerpsSDKClient

const MARKETS_RESPONSE = {
  markets: [
    {
      providerId: 'lighter',
      id: '0',
      categoryId: 'lighter',
      baseAsset: {
        providerId: 'lighter',
        id: '0',
        displaySymbol: 'BTC',
        logoURI: '',
      },
      quoteAsset: {
        providerId: 'lighter',
        id: 'USDC',
        displaySymbol: 'USDC',
        logoURI: '',
      },
      szDecimals: 4,
      markPrice: '50000',
      maxLeverage: 50,
      onlyIsolated: false,
      funding: { rate: '0.0001', nextFundingTime: 0 },
    },
  ],
}

const ASSETS_RESPONSE = {
  assets: [
    {
      providerId: 'lighter',
      id: '3',
      displaySymbol: 'USDC',
      logoURI: 'https://cdn.test/usdc.png',
    },
    { providerId: 'lighter', id: '0', displaySymbol: 'BTC', logoURI: '' },
  ],
}

const ACCOUNT_PAYLOAD = {
  code: 200,
  total: 1,
  accounts: [
    {
      code: 0,
      account_type: 1,
      index: 42,
      l1_address: ADDRESS,
      cancel_all_time: 0,
      total_order_count: 0,
      total_isolated_order_count: 0,
      pending_order_count: 0,
      available_balance: '100',
      status: 1,
      collateral: '500',
      transaction_time: 0,
      account_trading_mode: 1,
      account_index: 42,
      name: 'test',
      description: '',
      positions: [],
      assets: [],
      total_asset_value: '500',
      cross_asset_value: '500',
    },
  ],
}

const ORDER_BOOK_DETAILS_PAYLOAD = {
  code: 0,
  order_book_details: [
    {
      symbol: 'BTC',
      market_id: 0,
      market_type: 'perps',
      base_asset_id: 1,
      quote_asset_id: 3,
      status: 'active',
      taker_fee: '0.0005',
      maker_fee: '0.0001',
      liquidation_fee: '0',
      min_base_amount: '0.001',
      min_quote_amount: '10',
      order_quote_limit: '1000000',
      supported_size_decimals: 4,
      supported_price_decimals: 2,
      supported_quote_decimals: 2,
      size_decimals: 8,
      price_decimals: 2,
      quote_multiplier: 1,
      default_initial_margin_fraction: 100,
      min_initial_margin_fraction: 500,
      maintenance_margin_fraction: 250,
      closeout_margin_fraction: 100,
      last_trade_price: 50000,
      daily_trades_count: 100,
      daily_base_token_volume: 10,
      daily_quote_token_volume: 500000,
      daily_price_low: 49000,
      daily_price_high: 51000,
      daily_price_change: 2,
      open_interest: 100,
      daily_chart: {},
      market_config: {
        market_margin_mode: 0,
        insurance_fund_account_index: 0,
        liquidation_mode: 0,
        force_reduce_only: false,
        trading_hours: '24/7',
        funding_fee_discounts_enabled: false,
        hidden: false,
      },
      strategy_index: 0,
    },
  ],
  spot_order_book_details: [],
}

const APIKEYS_EMPTY = { code: 0, api_keys: [] }

// `ACCOUNT_PAYLOAD.accounts[0].index` is 42 — this trade has the viewer as the
// bidder, so the mapped fill is a BUY taker on the BTC market.
const TRADES_RESPONSE = {
  code: 0,
  next_cursor: '',
  trades: [
    {
      trade_id: 7,
      tx_hash: '0xfeed',
      type: 'trade',
      market_id: 0,
      size: '0.5',
      price: '50000',
      usd_amount: '25000',
      ask_id: 11,
      bid_id: 22,
      ask_account_id: 99,
      bid_account_id: 42,
      is_maker_ask: true,
      block_height: 1,
      timestamp: 1700000000000,
      taker_fee: 12,
      maker_fee: 3,
      transaction_time: 1700000000000,
      taker_position_size_before: '0',
      maker_position_size_before: '0',
    },
  ],
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

const respond = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(() => {
  recorded = []
  fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const urlStr = String(url)
    if (urlStr.includes('backend.test/v1/perps/markets')) {
      return respond(MARKETS_RESPONSE)
    }
    if (urlStr.includes('backend.test/v1/perps/assets')) {
      return respond(ASSETS_RESPONSE)
    }
    const u = String(url)
    recorded.push({ url: u, init })
    if (u.includes('/api/v1/account?')) {
      return respond(ACCOUNT_PAYLOAD)
    }
    if (u.includes('/api/v1/orderBookDetails')) {
      return respond(ORDER_BOOK_DETAILS_PAYLOAD)
    }
    if (u.includes('/api/v1/apikeys')) {
      return respond(APIKEYS_EMPTY)
    }
    if (u.includes('/api/v1/accountLimits')) {
      return respond({
        code: 0,
        max_llp_percentage: 0,
        max_llp_amount: '0',
        user_tier: 'STANDARD',
        can_create_public_pool: false,
        current_maker_fee_tick: 100,
        current_taker_fee_tick: 280,
        leased_lit: '0',
        effective_lit_stakes: '0',
      })
    }
    if (u.includes('/api/v1/accountActiveOrders')) {
      return respond({ code: 0, next_cursor: '', orders: [] })
    }
    if (u.includes('/api/v1/deposit/history')) {
      return respond({
        code: 0,
        deposits: [
          {
            id: 'd1',
            asset_id: 3,
            amount: '100',
            timestamp: 1700000000000,
            status: 'completed',
            l1_tx_hash: '0xabc',
          },
        ],
      })
    }
    if (u.includes('/api/v1/withdraw/history')) {
      return respond({ code: 0, withdraws: [] })
    }
    if (u.includes('/api/v1/positionFunding')) {
      return respond({ code: 0, position_fundings: [] })
    }
    if (u.includes('/api/v1/trades')) {
      return respond(TRADES_RESPONSE)
    }
    if (u.includes('/api/v1/liquidations')) {
      return respond({ code: 0, liquidations: [] })
    }
    if (u.includes('/api/v1/transfer/history')) {
      return respond({ code: 0, transfers: [] })
    }
    if (u.includes('/api/v1/funding-rates')) {
      return respond({
        code: 0,
        funding_rates: [
          { market_id: 0, exchange: 'lighter', symbol: 'BTC', rate: 0.0001 },
        ],
      })
    }
    if (u.includes('/api/v1/tokenlist')) {
      return respond({
        code: 0,
        tokens: [
          {
            symbol: 'BTC',
            name: 'Bitcoin',
            logo: 'btc',
            logo_extension: 'svg',
            market: 'PERPS',
          },
        ],
      })
    }
    throw new Error(`Unhandled URL in test: ${u}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LighterProvider — `type` field', () => {
  it('reports `lighter` as the provider key', () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    expect(provider.type).toBe('lighter')
  })
})

describe('LighterProvider — order formatting and liquidation surface', () => {
  const btcMarket = {
    ...MARKETS_RESPONSE.markets[0],
    priceDecimals: 1,
    maintenanceMarginRate: 0.012,
  }

  it('formats prices and sizes against the Lighter decimal budgets', () => {
    const provider = lighterProvider()
    expect(provider.formatOrderPrice(btcMarket, 50000.25)).toBe('50000.3')
    expect(provider.formatOrderSize(btcMarket, 0.123456)).toBe('0.1234')
  })

  it('estimates liquidation from the market maintenanceMarginRate', () => {
    const provider = lighterProvider()
    // entry * (1 - 1/leverage) / (1 - mmr) = 50000 * 0.9 / 0.988
    const liq = provider.estimateLiquidationPrice(btcMarket, {
      entryPrice: 50000,
      leverage: 10,
      isLong: true,
    })
    expect(liq).toBeCloseTo(45546.559, 2)
  })
})

describe('LighterProvider — auth token plumbing', () => {
  it('forwards a per-call `lighterAuthToken` to auth-gated endpoints', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    await provider.getAccount(
      { address: ADDRESS },
      {
        lighterAuthToken: 'per-call-token',
      }
    )
    const limitsCall = recorded.find((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsCall).toBeDefined()
    expect(limitsCall?.url).toContain('auth=per-call-token')
  })

  // A fee-tier fetch failure must NOT be coerced into a fabricated 0%/0% fee
  // tier — that shows a trader fake fees. The error has to surface.
  it('propagates an accountLimits fetch error instead of masking it as a 0% fee tier', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('backend.test/v1/perps/markets')) {
          return respond(MARKETS_RESPONSE)
        }
        if (u.includes('backend.test/v1/perps/assets')) {
          return respond(ASSETS_RESPONSE)
        }
        if (u.includes('/api/v1/account?')) {
          return respond(ACCOUNT_PAYLOAD)
        }
        if (u.includes('/api/v1/apikeys')) {
          return respond(APIKEYS_EMPTY)
        }
        if (u.includes('/api/v1/accountLimits')) {
          return new Response('boom', { status: 500 })
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    await expect(
      provider.getAccount(
        { address: ADDRESS },
        { lighterAuthToken: 'per-call-token' }
      )
    ).rejects.toThrow()
  })

  it('uses a pre-created `authToken` from constructor when no per-call override', async () => {
    const provider = lighterProvider({ authToken: 'pre-created-token' })
    provider.bind(STUB_CLIENT)
    await provider.getAccount({ address: ADDRESS })
    const limitsCall = recorded.find((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsCall?.url).toContain('auth=pre-created-token')
  })

  it('accepts an async `authToken` source function', async () => {
    let calls = 0
    const provider = lighterProvider({
      authToken: async () => {
        calls++
        return `dynamic-token-${calls}`
      },
    })
    provider.bind(STUB_CLIENT)
    await provider.getAccount({ address: ADDRESS })
    expect(calls).toBeGreaterThanOrEqual(1)
    const limitsCall = recorded.find((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsCall?.url).toContain('auth=dynamic-token-1')
  })

  it('creates a read-only token on first use and forwards it (never the read-write token) on auth-gated reads', async () => {
    const createdTokens: string[] = []
    const signerStub = {
      createAuthToken: vi.fn(async (deadline: number) => {
        const t = `created-${deadline}`
        createdTokens.push(t)
        return t
      }),
    } as unknown as LighterSigner
    const keyStore = new LighterKeyStore(createMemoryStorage())
    await keyStore.set(ADDRESS, {
      accountIndex: 100,
      apiKeyIndex: 42,
      apiKeyPrivateKey: '0xabc',
      apiKeyPublicKey: '0xdef',
    })
    const tokenFetcher = vi.fn(async () => ({
      api_token: 'ro-readonly-lighter',
      account_index: 100,
      expiry: FAR_EXPIRY_SECONDS,
      scopes: 'all',
    }))
    const provider = lighterProvider({
      signer: signerStub,
      keyStore,
      readOnlyTokenOptions: {
        storage: createMemoryStorage(),
        fetcher: tokenFetcher,
      },
    })
    provider.bind(STUB_CLIENT)
    await provider.getAccount({ address: ADDRESS })
    // Standard (read-write) token is signed exactly once — only to authorise
    // the read-only token creation, never to authenticate the read itself.
    expect(createdTokens.length).toBe(1)
    expect(tokenFetcher).toHaveBeenCalledTimes(1)
    expect(tokenFetcher).toHaveBeenCalledWith(
      expect.objectContaining({
        authorization: createdTokens[0],
        accountIndex: 100,
      })
    )
    const limitsCall = recorded.find((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsCall?.url).toContain('auth=ro-readonly-lighter')
  })

  it('creates the read-only token at most once and reuses it across reads', async () => {
    const signerStub = {
      createAuthToken: vi.fn(async (deadline: number) => `tok-${deadline}`),
    } as unknown as LighterSigner
    const keyStore = new LighterKeyStore(createMemoryStorage())
    await keyStore.set(ADDRESS, {
      accountIndex: 100,
      apiKeyIndex: 42,
      apiKeyPrivateKey: '0xabc',
      apiKeyPublicKey: '0xdef',
    })
    const tokenFetcher = vi.fn(async () => ({
      api_token: 'ro-readonly-lighter',
      account_index: 100,
      expiry: FAR_EXPIRY_SECONDS,
      scopes: 'all',
    }))
    const provider = lighterProvider({
      signer: signerStub,
      keyStore,
      readOnlyTokenOptions: {
        storage: createMemoryStorage(),
        fetcher: tokenFetcher,
      },
    })
    provider.bind(STUB_CLIENT)
    await provider.getAccount({ address: ADDRESS })
    await provider.getAccount({ address: ADDRESS })
    // tokens/create hit exactly once across both reads; the second read reuses
    // the persisted token and so never re-signs a standard token either.
    expect(tokenFetcher).toHaveBeenCalledTimes(1)
    expect(
      (
        signerStub as unknown as {
          createAuthToken: { mock: { calls: unknown[] } }
        }
      ).createAuthToken.mock.calls.length
    ).toBe(1)
    const limitsCalls = recorded.filter((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsCalls).toHaveLength(2)
    for (const call of limitsCalls) {
      expect(call.url).toContain('auth=ro-readonly-lighter')
    }
  })

  it('skips on-demand creating when no API key is registered for the address', async () => {
    const signerStub = {
      createAuthToken: vi.fn(async () => 'should-not-be-called'),
    } as unknown as LighterSigner
    const keyStore = new LighterKeyStore(createMemoryStorage())
    const provider = lighterProvider({ signer: signerStub, keyStore })
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount({ address: ADDRESS })
    // No API key → falls back to the unauthenticated degrade path (zero fee tier).
    expect(account.feeTier).toEqual({ maker: '0', taker: '0' })
    // `account_trading_mode` from DetailedAccount is threaded into the config.
    expect(account.config).toMatchObject({ accountTradingMode: 1 })
    expect(
      (
        signerStub as unknown as {
          createAuthToken: { mock: { calls: unknown[] } }
        }
      ).createAuthToken.mock.calls.length
    ).toBe(0)
  })
})

describe('LighterProvider — read-only token revocation self-heal', () => {
  const LIMITS_OK = {
    code: 0,
    max_llp_percentage: 0,
    max_llp_amount: '0',
    user_tier: 'STANDARD',
    can_create_public_pool: false,
    current_maker_fee_tick: 100,
    current_taker_fee_tick: 280,
    leased_lit: '0',
    effective_lit_stakes: '0',
  }

  // Lighter signals a rejected token on EITHER channel — pin both.
  it.each([
    {
      label: 'HTTP 401',
      staleLimits: () => new Response('unauthorized', { status: 401 }),
    },
    {
      label: 'HTTP 200 body code 20013',
      staleLimits: () =>
        respond({ code: 20013, message: 'invalid auth string' }),
    },
  ])('evicts the revoked read-only token and retries with a fresh one ($label)', async ({
    staleLimits,
  }) => {
    const roStorage = createMemoryStorage()
    const keyStore = new LighterKeyStore(createMemoryStorage())
    await keyStore.set(ADDRESS, {
      accountIndex: 42,
      apiKeyIndex: 42,
      apiKeyPrivateKey: '0xabc',
      apiKeyPublicKey: '0xdef',
    })

    let createCount = 0
    const tokenFetcher = vi.fn(async () => {
      createCount += 1
      return {
        api_token: createCount === 1 ? 'ro-stale' : 'ro-fresh',
        account_index: 42,
        expiry: FAR_EXPIRY_SECONDS,
        scopes: 'all',
      }
    })
    const signerStub = {
      createAuthToken: vi.fn(async (d: number) => `std-${d}`),
    } as unknown as LighterSigner

    let limitsCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('backend.test/v1/perps/markets')) {
          return respond(MARKETS_RESPONSE)
        }
        if (u.includes('/api/v1/account?')) {
          return respond(ACCOUNT_PAYLOAD)
        }
        if (u.includes('/api/v1/apikeys')) {
          return respond(APIKEYS_EMPTY)
        }
        if (u.includes('/api/v1/accountLimits')) {
          limitsCalls += 1
          return u.includes('auth=ro-stale')
            ? staleLimits()
            : respond(LIMITS_OK)
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )

    const provider = lighterProvider({
      signer: signerStub,
      keyStore,
      readOnlyTokenOptions: { storage: roStorage, fetcher: tokenFetcher },
    })
    provider.bind(STUB_CLIENT)

    const account = await provider.getAccount({ address: ADDRESS })

    expect(tokenFetcher).toHaveBeenCalledTimes(2) // stale, then fresh after eviction
    expect(limitsCalls).toBe(2) // rejected once, retried once
    expect(account.feeTier.maker).not.toBe('0') // recovered read populated fees
    const stored = await roStorage.get(
      `lifi:perps:lighter:rotoken:${ADDRESS}:42`
    )
    expect(JSON.parse(stored as string).token).toBe('ro-fresh')
  })

  it('does NOT evict or retry when the caller supplied the auth token', async () => {
    const keyStore = new LighterKeyStore(createMemoryStorage())
    await keyStore.set(ADDRESS, {
      accountIndex: 42,
      apiKeyIndex: 42,
      apiKeyPrivateKey: '0xabc',
      apiKeyPublicKey: '0xdef',
    })
    const tokenFetcher = vi.fn(async () => ({
      api_token: 'ro-should-not-create',
      account_index: 42,
      expiry: FAR_EXPIRY_SECONDS,
      scopes: 'all',
    }))

    let limitsCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('backend.test/v1/perps/markets')) {
          return respond(MARKETS_RESPONSE)
        }
        if (u.includes('/api/v1/account?')) {
          return respond(ACCOUNT_PAYLOAD)
        }
        if (u.includes('/api/v1/apikeys')) {
          return respond(APIKEYS_EMPTY)
        }
        if (u.includes('/api/v1/accountLimits')) {
          limitsCalls += 1
          return new Response('unauthorized', { status: 401 })
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )

    const provider = lighterProvider({
      signer: {
        createAuthToken: vi.fn(async () => 'unused'),
      } as unknown as LighterSigner,
      keyStore,
      readOnlyTokenOptions: {
        storage: createMemoryStorage(),
        fetcher: tokenFetcher,
      },
    })
    provider.bind(STUB_CLIENT)

    // The 401 surfaces rather than being masked as a 0% fee tier; with a
    // caller-supplied token it is not the SDK's to self-heal.
    await expect(
      provider.getAccount(
        { address: ADDRESS },
        { lighterAuthToken: 'caller-token' }
      )
    ).rejects.toThrow()

    expect(tokenFetcher).toHaveBeenCalledTimes(0) // never created an SDK-owned token
    expect(limitsCalls).toBe(1) // 401 surfaced, not retried
  })
})

describe('LighterProvider — read-only token creation failure recovery', () => {
  const seedKeyStore = async (): Promise<LighterKeyStore> => {
    const keyStore = new LighterKeyStore(createMemoryStorage())
    await keyStore.set(ADDRESS, {
      accountIndex: 42,
      apiKeyIndex: 42,
      apiKeyPrivateKey: '0xabc',
      apiKeyPublicKey: '0xdef',
    })
    return keyStore
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('falls back to the standard token only while the backoff window is open, then re-attempts creation', async () => {
    let nowMs = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs)

    const keyStore = await seedKeyStore()
    let stdCount = 0
    const signerStub = {
      createAuthToken: vi.fn(async () => {
        stdCount += 1
        return `std-${stdCount}`
      }),
    } as unknown as LighterSigner
    const tokenFetcher = vi.fn(async () => ({
      api_token: 'ro-recovered',
      account_index: 42,
      expiry: FAR_EXPIRY_SECONDS,
      scopes: 'all',
    }))
    tokenFetcher.mockRejectedValueOnce(
      new PerpsError(PerpsErrorCode.ServerError, 'tokens/create unavailable')
    )

    const provider = lighterProvider({
      signer: signerStub,
      keyStore,
      readOnlyTokenOptions: {
        storage: createMemoryStorage(),
        fetcher: tokenFetcher,
      },
    })
    provider.bind(STUB_CLIENT)

    await provider.getAccount({ address: ADDRESS })
    await provider.getAccount({ address: ADDRESS })
    // Creation failed once; the immediate second read stays on the standard
    // fallback without re-hitting tokens/create.
    expect(tokenFetcher).toHaveBeenCalledTimes(1)
    const limitsDuringBackoff = recorded.filter((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsDuringBackoff).toHaveLength(2)
    for (const call of limitsDuringBackoff) {
      expect(call.url).toContain('auth=std-1')
    }

    nowMs += 31_000 // past the 30s backoff window
    await provider.getAccount({ address: ADDRESS })
    expect(tokenFetcher).toHaveBeenCalledTimes(2)
    const limitsAfterBackoff = recorded.filter((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsAfterBackoff).toHaveLength(3)
    expect(limitsAfterBackoff[2].url).toContain('auth=ro-recovered')
  })

  it('keeps the requested expiry under the 10-year cap when the client clock runs ahead of the server', async () => {
    const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60
    const CLOCK_SKEW_SECONDS = 60
    const keyStore = await seedKeyStore()
    const signerStub = {
      createAuthToken: vi.fn(async (d: number) => `std-${d}`),
    } as unknown as LighterSigner
    // Server clock runs 60s behind the client; Lighter enforces the 10-year
    // maximum against its own clock.
    const tokenFetcher = vi.fn(async ({ expiry }: { expiry: number }) => {
      const serverNowSeconds =
        Math.floor(Date.now() / 1000) - CLOCK_SKEW_SECONDS
      if (expiry > serverNowSeconds + TEN_YEARS_SECONDS) {
        throw new PerpsError(
          PerpsErrorCode.ServerError,
          'Lighter tokens/create returned 400: expiry exceeds the maximum'
        )
      }
      return {
        api_token: 'ro-margin',
        account_index: 42,
        expiry,
        scopes: 'all',
      }
    })

    const provider = lighterProvider({
      signer: signerStub,
      keyStore,
      readOnlyTokenOptions: {
        storage: createMemoryStorage(),
        fetcher: tokenFetcher,
      },
    })
    provider.bind(STUB_CLIENT)

    await provider.getAccount({ address: ADDRESS })
    expect(tokenFetcher).toHaveBeenCalledTimes(1)
    const limitsCall = recorded.find((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsCall?.url).toContain('auth=ro-margin')
  })
})

describe('LighterProvider — standard token revocation self-heal', () => {
  const LIMITS_OK = {
    code: 0,
    max_llp_percentage: 0,
    max_llp_amount: '0',
    user_tier: 'STANDARD',
    can_create_public_pool: false,
    current_maker_fee_tick: 100,
    current_taker_fee_tick: 280,
    leased_lit: '0',
    effective_lit_stakes: '0',
  }

  it('re-signs a fresh standard token when the server rejects the cached one', async () => {
    const keyStore = new LighterKeyStore(createMemoryStorage())
    await keyStore.set(ADDRESS, {
      accountIndex: 42,
      apiKeyIndex: 42,
      apiKeyPrivateKey: '0xabc',
      apiKeyPublicKey: '0xdef',
    })
    let stdCount = 0
    const signerStub = {
      createAuthToken: vi.fn(async () => {
        stdCount += 1
        return `std-${stdCount}`
      }),
    } as unknown as LighterSigner
    // Read-only creation is unavailable throughout, so reads ride the
    // standard-token fallback — and the fallback token gets revoked.
    const tokenFetcher = vi.fn(async () => {
      throw new PerpsError(
        PerpsErrorCode.ServerError,
        'tokens/create unavailable'
      )
    })

    let limitsCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('backend.test/v1/perps/markets')) {
          return respond(MARKETS_RESPONSE)
        }
        if (u.includes('/api/v1/account?')) {
          return respond(ACCOUNT_PAYLOAD)
        }
        if (u.includes('/api/v1/apikeys')) {
          return respond(APIKEYS_EMPTY)
        }
        if (u.includes('/api/v1/accountLimits')) {
          limitsCalls += 1
          // std-1 is revoked server-side; only a re-signed token passes.
          return u.includes('auth=std-1')
            ? new Response('unauthorized', { status: 401 })
            : respond(LIMITS_OK)
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )

    const provider = lighterProvider({
      signer: signerStub,
      keyStore,
      readOnlyTokenOptions: {
        storage: createMemoryStorage(),
        fetcher: tokenFetcher,
      },
    })
    provider.bind(STUB_CLIENT)

    const account = await provider.getAccount({ address: ADDRESS })

    expect(limitsCalls).toBe(2) // rejected once, retried with the fresh token
    expect(stdCount).toBe(2) // the revoked token was re-signed, not reused
    expect(account.feeTier.maker).not.toBe('0')
  })
})

describe('LighterProvider — authed read body-error handling (getOrders)', () => {
  const accountWithOpenOrder = {
    ...ACCOUNT_PAYLOAD,
    accounts: [
      {
        ...ACCOUNT_PAYLOAD.accounts[0],
        positions: [
          {
            market_id: 0,
            symbol: 'BTC',
            initial_margin_fraction: '5.00',
            open_order_count: 1,
            pending_order_count: 0,
            position_tied_order_count: 0,
            sign: 1,
            position: '1.0',
            avg_entry_price: '50000',
            position_value: '50000',
            unrealized_pnl: '10',
            realized_pnl: '0',
            liquidation_price: '40000',
            total_funding_paid_out: '0',
            margin_mode: 0,
            allocated_margin: '2500',
            total_discount: '0',
          },
        ],
      },
    ],
  }

  it('surfaces a 200-with-error-code authed response as a PerpsError, not a TypeError', async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_RESPONSE)
      }
      if (u.includes('backend.test/v1/perps/assets')) {
        return respond(ASSETS_RESPONSE)
      }
      if (u.includes('/api/v1/account?')) {
        return respond(accountWithOpenOrder)
      }
      if (u.includes('/api/v1/accountActiveOrders')) {
        return respond({ code: 21100, message: 'account not found' })
      }
      throw new Error(`Unhandled URL in test: ${u}`)
    })

    const provider = lighterProvider({ authToken: 'caller-token' })
    provider.bind(STUB_CLIENT)

    const err = await provider
      .getOrders({ address: ADDRESS })
      .then(() => undefined)
      .catch((e) => e)
    expect(err).toBeInstanceOf(PerpsError)
    expect(err).not.toBeInstanceOf(TypeError)
    expect(err.code).toBe(PerpsErrorCode.ThirdPartyError)
  })

  it('routes a 200-with-invalid-auth-code authed response through the evict/retry flow', async () => {
    const keyStore = new LighterKeyStore(createMemoryStorage())
    await keyStore.set(ADDRESS, {
      accountIndex: 42,
      apiKeyIndex: 42,
      apiKeyPrivateKey: '0xabc',
      apiKeyPublicKey: '0xdef',
    })

    let createCount = 0
    const tokenFetcher = vi.fn(async () => {
      createCount += 1
      return {
        api_token: createCount === 1 ? 'ro-stale' : 'ro-fresh',
        account_index: 42,
        expiry: FAR_EXPIRY_SECONDS,
        scopes: 'all',
      }
    })

    let activeOrderCalls = 0
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_RESPONSE)
      }
      if (u.includes('backend.test/v1/perps/assets')) {
        return respond(ASSETS_RESPONSE)
      }
      if (u.includes('/api/v1/account?')) {
        return respond(accountWithOpenOrder)
      }
      if (u.includes('/api/v1/accountActiveOrders')) {
        activeOrderCalls += 1
        return u.includes('auth=ro-stale')
          ? respond({ code: 20013, message: 'invalid auth string' })
          : respond({ code: 0, next_cursor: '', orders: [] })
      }
      throw new Error(`Unhandled URL in test: ${u}`)
    })

    const provider = lighterProvider({
      signer: {
        createAuthToken: vi.fn(async (d: number) => `std-${d}`),
      } as unknown as LighterSigner,
      keyStore,
      readOnlyTokenOptions: {
        storage: createMemoryStorage(),
        fetcher: tokenFetcher,
      },
    })
    provider.bind(STUB_CLIENT)

    const orders = await provider.getOrders({ address: ADDRESS })

    expect(tokenFetcher).toHaveBeenCalledTimes(2) // stale, then fresh after eviction
    expect(activeOrderCalls).toBe(2) // rejected once, retried once
    expect(orders.openOrders).toEqual([])
    expect(orders.triggerOrders).toEqual([])
  })
})

describe('LighterProvider — getOrders pagination contract', () => {
  const accountWithManyOrders = {
    ...ACCOUNT_PAYLOAD,
    accounts: [
      {
        ...ACCOUNT_PAYLOAD.accounts[0],
        positions: [
          {
            market_id: 0,
            symbol: 'BTC',
            initial_margin_fraction: '5.00',
            open_order_count: 200,
            pending_order_count: 0,
            position_tied_order_count: 0,
            sign: 1,
            position: '1.0',
            avg_entry_price: '50000',
            position_value: '50000',
            unrealized_pnl: '10',
            realized_pnl: '0',
            liquidation_price: '40000',
            total_funding_paid_out: '0',
            margin_mode: 0,
            allocated_margin: '2500',
            total_discount: '0',
          },
        ],
      },
    ],
  }

  const makeActiveOrder = (orderIndex: number) => ({
    order_index: orderIndex,
    client_order_index: orderIndex,
    order_id: String(orderIndex),
    client_order_id: String(orderIndex),
    market_index: 0,
    owner_account_index: 42,
    initial_base_amount: '0.1',
    price: '50000',
    nonce: orderIndex,
    remaining_base_amount: '0.1',
    is_ask: false,
    filled_base_amount: '0',
    filled_quote_amount: '0',
    side: 'buy',
    type: 'limit',
    time_in_force: 'good_till_time',
    reduce_only: false,
    trigger_price: '',
    order_expiry: 0,
    status: 'open',
    trigger_status: 'na',
    trigger_time: 0,
    parent_order_index: 0,
    parent_order_id: '',
    to_trigger_order_id_0: '',
    to_trigger_order_id_1: '',
    to_cancel_order_id_0: '',
    block_height: 1,
    timestamp: 1700000000000,
    created_at: 1700000000,
    updated_at: 1700000000,
    transaction_time: 1700000000000,
  })

  it('returns a payload whose size, hasMore and cursor agree when the active-orders response exceeds the requested limit', async () => {
    const activeOrders = Array.from({ length: 200 }, (_, i) =>
      makeActiveOrder(i + 1)
    )
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_RESPONSE)
      }
      if (u.includes('backend.test/v1/perps/assets')) {
        return respond(ASSETS_RESPONSE)
      }
      if (u.includes('/api/v1/account?')) {
        return respond(accountWithManyOrders)
      }
      if (u.includes('/api/v1/accountActiveOrders')) {
        return respond({ code: 0, next_cursor: '', orders: activeOrders })
      }
      throw new Error(`Unhandled URL in test: ${u}`)
    })

    const provider = lighterProvider({ authToken: 'caller-token' })
    provider.bind(STUB_CLIENT)

    const orders = await provider.getOrders({ address: ADDRESS, limit: 50 })

    const returned = orders.openOrders.length + orders.triggerOrders.length
    expect(returned).toBe(200)
    expect(orders.pagination.hasMore).toBe(false)
    expect(orders.pagination.cursor).toBeUndefined()
    expect(orders.pagination.limit).toBe(returned)
  })
})

describe('LighterProvider — unauthenticated degrade paths', () => {
  it('getAccount returns zero fee tier when no token is configured', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount({ address: ADDRESS })
    expect(account.feeTier).toEqual({ maker: '0', taker: '0' })
    // accountLimits should NOT have been called
    expect(
      recorded.find((r) => r.url.includes('/api/v1/accountLimits'))
    ).toBeUndefined()
  })

  it('getOrders returns empty arrays when no token is configured', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const orders = await provider.getOrders({ address: ADDRESS })
    expect(orders.openOrders).toEqual([])
    expect(orders.triggerOrders).toEqual([])
    expect(orders.pagination.hasMore).toBe(false)
  })

  it('getActivity returns empty items when no token is configured', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const activity = await provider.getActivity({
      address: ADDRESS,
    })
    expect(activity.items).toEqual([])
    expect(activity.pagination.hasMore).toBe(false)
  })

  it('getFills returns an empty page without hitting /api/v1/trades when no token is configured', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const fills = await provider.getFills({ address: ADDRESS })
    expect(fills.items).toEqual([])
    expect(fills.pagination.hasMore).toBe(false)
    expect(
      recorded.find((r) => r.url.includes('/api/v1/trades'))
    ).toBeUndefined()
  })

  it('getOrder throws when no token is configured', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    await expect(
      provider.getOrder({ address: ADDRESS, id: 'order_1' })
    ).rejects.toThrow(/auth token/i)
  })
})

describe('LighterProvider — getAccount carries positions', () => {
  const accountWithPosition = {
    ...ACCOUNT_PAYLOAD,
    accounts: [
      {
        ...ACCOUNT_PAYLOAD.accounts[0],
        positions: [
          {
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
            unrealized_pnl: '10',
            realized_pnl: '0',
            liquidation_price: '40000',
            total_funding_paid_out: '0',
            margin_mode: 0,
            allocated_margin: '2500',
            total_discount: '0',
          },
        ],
      },
    ],
  }

  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_RESPONSE)
      }
      if (u.includes('backend.test/v1/perps/assets')) {
        return respond(ASSETS_RESPONSE)
      }
      recorded.push({ url: u })
      if (u.includes('/api/v1/account?')) {
        return respond(accountWithPosition)
      }
      if (u.includes('/api/v1/apikeys')) {
        return respond(APIKEYS_EMPTY)
      }
      throw new Error(`Unhandled URL in test: ${u}`)
    })
  })

  it('exposes positions deep-equal to getPositions for identical fixtures', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)

    const account = await provider.getAccount({ address: ADDRESS })
    const { positions } = await provider.getPositions({ address: ADDRESS })

    expect(account.positions).toEqual(positions)
    expect(account.positions).toHaveLength(1)
    expect(account.positions[0].market.id).toBe('0')
  })
})

describe('LighterProvider — getFills authed path', () => {
  it('forwards the read-only token to /api/v1/trades and maps fills', async () => {
    const provider = lighterProvider({ authToken: 'pre-created-token' })
    provider.bind(STUB_CLIENT)
    const fills = await provider.getFills({ address: ADDRESS })

    const tradesCall = recorded.find((r) => r.url.includes('/api/v1/trades'))
    expect(tradesCall).toBeDefined()
    expect(tradesCall?.url).toContain('auth=pre-created-token')

    expect(fills.items).toHaveLength(1)
    expect(fills.items[0]).toMatchObject({
      id: '7',
      side: OrderSide.BUY,
      size: '0.5',
      price: '50000',
      liquidity: LiquidityRole.TAKER,
    })
    expect(fills.pagination.hasMore).toBe(false)
  })
})

describe('LighterProvider — direct-REST (no LI.FI backend fallback)', () => {
  it('hits Lighter mainnet by default', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    await provider.getAccount({ address: ADDRESS })
    for (const call of recorded) {
      expect(call.url).toMatch(/^https:\/\/mainnet\.zklighter\.elliot\.ai\//)
    }
  })

  it('respects a custom `restUrl` override', async () => {
    const provider = lighterProvider({
      restUrl: 'https://testnet.zklighter.elliot.ai',
    })
    provider.bind(STUB_CLIENT)
    await provider.getAccount({ address: ADDRESS })
    for (const call of recorded) {
      expect(call.url).toMatch(/^https:\/\/testnet\.zklighter\.elliot\.ai\//)
    }
  })
})

describe('LighterProvider — normalisation', () => {
  // getMarketsContext / getAssets normalisation now happens server-side (LI.FI backend
  // calls Lighter directly, maps to generic types, caches in Valkey, returns
  // post-mapped shape). Plugin delegates these methods to the core SDK
  // service, so there's nothing left to normalise in this package.

  it('emits a base64url cursor on getActivity when upstream provides one', async () => {
    // Re-stub fetch to return a deposits cursor
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      recorded.push({ url: u })
      if (u.includes('/api/v1/account?')) {
        return respond(ACCOUNT_PAYLOAD)
      }
      if (u.includes('/api/v1/orderBookDetails')) {
        return respond(ORDER_BOOK_DETAILS_PAYLOAD)
      }
      if (u.includes('/api/v1/deposit/history')) {
        return respond({
          code: 0,
          deposits: [
            {
              id: 'd1',
              asset_id: 3,
              amount: '100',
              timestamp: 1700000000000,
              status: 'completed',
              l1_tx_hash: '0xabc',
            },
          ],
          cursor: 'next-deposits-cursor',
        })
      }
      if (u.includes('/api/v1/withdraw/history')) {
        return respond({ code: 0, withdraws: [] })
      }
      if (u.includes('/api/v1/positionFunding')) {
        return respond({ code: 0, position_fundings: [] })
      }
      if (u.includes('/api/v1/liquidations')) {
        return respond({ code: 0, liquidations: [] })
      }
      if (u.includes('/api/v1/transfer/history')) {
        return respond({ code: 0, transfers: [] })
      }
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_RESPONSE)
      }
      if (u.includes('backend.test/v1/perps/assets')) {
        return respond(ASSETS_RESPONSE)
      }
      throw new Error(`Unhandled URL in test: ${u}`)
    })

    const provider = lighterProvider({ authToken: 'tok' })
    provider.bind(STUB_CLIENT)
    const result = await provider.getActivity({
      address: ADDRESS,
      type: [ActivityType.DEPOSIT],
    })
    expect(result.pagination.hasMore).toBe(true)
    expect(result.pagination.cursor).toBeTypeOf('string')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].type).toBe(ActivityType.DEPOSIT)
    expect(result.items[0].explorerLink).toBe('https://scan.li.fi/tx/0xabc')
  })
})

describe('LighterProvider — getActivity paging never drops rows', () => {
  const depositRow = (id: string, timestampMs: number) => ({
    id,
    asset_id: 3,
    amount: '100',
    timestamp: timestampMs,
    status: 'completed',
    l1_tx_hash: `0x${id}`,
  })

  const withdrawRow = (id: string, timestampMs: number) => ({
    id,
    asset_id: 3,
    amount: '50',
    timestamp: timestampMs,
    status: 'completed',
    l1_tx_hash: `0x${id}`,
  })

  // Deposits paginate over two upstream pages; withdrawals are single-page.
  // A page-1 `limit` below the merged count forces a sliced-off overflow tail
  // whose upstream cursor has already advanced past it.
  const stubPagedHistory = () =>
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      recorded.push({ url: u })
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_RESPONSE)
      }
      if (u.includes('backend.test/v1/perps/assets')) {
        return respond(ASSETS_RESPONSE)
      }
      if (u.includes('/api/v1/account?')) {
        return respond(ACCOUNT_PAYLOAD)
      }
      if (u.includes('/api/v1/orderBookDetails')) {
        return respond(ORDER_BOOK_DETAILS_PAYLOAD)
      }
      if (u.includes('/api/v1/deposit/history')) {
        if (u.includes('cursor=dep-next')) {
          return respond({
            code: 0,
            deposits: [depositRow('d3', 1700000001000)],
          })
        }
        return respond({
          code: 0,
          deposits: [
            depositRow('d1', 1700000005000),
            depositRow('d2', 1700000004000),
          ],
          cursor: 'dep-next',
        })
      }
      if (u.includes('/api/v1/withdraw/history')) {
        return respond({
          code: 0,
          withdraws: [
            withdrawRow('w1', 1700000003000),
            withdrawRow('w2', 1700000002000),
          ],
        })
      }
      if (u.includes('/api/v1/positionFunding')) {
        return respond({ code: 0, position_fundings: [] })
      }
      if (u.includes('/api/v1/liquidations')) {
        return respond({ code: 0, liquidations: [] })
      }
      if (u.includes('/api/v1/transfer/history')) {
        return respond({ code: 0, transfers: [] })
      }
      throw new Error(`Unhandled URL in test: ${u}`)
    })

  it('returns every row exactly once across paged calls (limit < merged count)', async () => {
    stubPagedHistory()
    const provider = lighterProvider({ authToken: 'tok' })
    provider.bind(STUB_CLIENT)

    const seen: string[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const page = await provider.getActivity({
        address: ADDRESS,
        type: [ActivityType.DEPOSIT, ActivityType.WITHDRAWAL],
        limit: 3,
        ...(cursor === undefined ? {} : { cursor }),
      })
      expect(page.items.length).toBeLessThanOrEqual(3)
      for (const it of page.items) {
        seen.push(it.id)
      }
      cursor = page.pagination.hasMore ? page.pagination.cursor : undefined
      pages += 1
      expect(pages).toBeLessThan(10)
    } while (cursor !== undefined)

    // d1..d3 (3 deposits across two upstream pages) + w1, w2 = 5 rows, each once.
    expect(seen.slice().sort()).toEqual(['d1', 'd2', 'd3', 'w1', 'w2'])
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('keeps hasMore true while a sliced overflow tail remains', async () => {
    stubPagedHistory()
    const provider = lighterProvider({ authToken: 'tok' })
    provider.bind(STUB_CLIENT)
    const page1 = await provider.getActivity({
      address: ADDRESS,
      type: [ActivityType.DEPOSIT, ActivityType.WITHDRAWAL],
      limit: 3,
    })
    expect(page1.items).toHaveLength(3)
    expect(page1.items.find((item) => item.id === 'd1')?.explorerLink).toBe(
      'https://scan.li.fi/tx/0xd1'
    )
    expect(page1.items.find((item) => item.id === 'w1')?.explorerLink).toBe(
      'https://scan.li.fi/tx/0xw1'
    )
    expect(page1.pagination.hasMore).toBe(true)
    expect(page1.pagination.cursor).toBeTypeOf('string')
  })
})

describe('LighterProvider — getActivity transfer token registry', () => {
  const transferRow = (assetId: number) => ({
    id: `tr-${assetId}`,
    from_account_index: 42,
    to_account_index: 99,
    asset_id: assetId,
    amount: '25',
    timestamp: 1700000000000,
    type: 'standard',
    tx_hash: '0xfeed',
    from_route: 'r1',
    to_route: 'r2',
    fee: '0',
  })

  const stubWithTransfer = (assetId: number) =>
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      recorded.push({ url: u })
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_RESPONSE)
      }
      if (u.includes('backend.test/v1/perps/assets')) {
        return respond(ASSETS_RESPONSE)
      }
      if (u.includes('/api/v1/account?')) {
        return respond(ACCOUNT_PAYLOAD)
      }
      if (u.includes('/api/v1/orderBookDetails')) {
        return respond(ORDER_BOOK_DETAILS_PAYLOAD)
      }
      if (u.includes('/api/v1/transfer/history')) {
        return respond({ code: 0, transfers: [transferRow(assetId)] })
      }
      if (
        u.includes('/api/v1/deposit/history') ||
        u.includes('/api/v1/withdraw/history')
      ) {
        return respond({ code: 0, deposits: [], withdraws: [] })
      }
      if (u.includes('/api/v1/positionFunding')) {
        return respond({ code: 0, position_fundings: [] })
      }
      if (u.includes('/api/v1/liquidations')) {
        return respond({ code: 0, liquidations: [] })
      }
      throw new Error(`Unhandled URL in test: ${u}`)
    })

  it('maps a transfer asset_id to its backend token symbol', async () => {
    stubWithTransfer(3)
    const provider = lighterProvider({ authToken: 'tok' })
    provider.bind(STUB_CLIENT)
    const { items } = await provider.getActivity({
      address: ADDRESS,
      type: [ActivityType.TRANSFER],
    })
    const transfer = items.find((i) => i.type === ActivityType.TRANSFER)
    expect(transfer?.asset).toBe('USDC')
  })

  it('falls back to String(asset_id) when the token registry has no symbol', async () => {
    stubWithTransfer(777)
    const provider = lighterProvider({ authToken: 'tok' })
    provider.bind(STUB_CLIENT)
    const { items } = await provider.getActivity({
      address: ADDRESS,
      type: [ActivityType.TRANSFER],
    })
    const transfer = items.find((i) => i.type === ActivityType.TRANSFER)
    expect(transfer?.asset).toBe('777')
  })

  it('fetches /perps/assets per getActivity call (no client-side memo; backend caches)', async () => {
    stubWithTransfer(3)
    const provider = lighterProvider({ authToken: 'tok' })
    provider.bind(STUB_CLIENT)
    await provider.getActivity({
      address: ADDRESS,
      type: [ActivityType.TRANSFER],
    })
    await provider.getActivity({
      address: ADDRESS,
      type: [ActivityType.TRANSFER],
    })
    const tokenCalls = recorded.filter((r) =>
      r.url.includes('backend.test/v1/perps/assets')
    )
    expect(tokenCalls).toHaveLength(2)
  })
})

describe('LighterProvider — getOrder', () => {
  it('rejects tx-hash-shaped ids with OrderNotFound + guidance', async () => {
    const provider = lighterProvider({ authToken: 'tok' })
    provider.bind(STUB_CLIENT)
    const txHashShape = '0'.repeat(80) // valid 80-hex shape
    await expect(
      provider.getOrder({ address: ADDRESS, id: txHashShape })
    ).rejects.toThrow(/looks like a tx hash/)
  })
})

describe('LighterProvider — getFills logos and realized PnL', () => {
  const BTC_LOGO = 'https://cdn.test/btc.svg'
  const MARKETS_WITH_LOGO = {
    markets: [
      {
        ...MARKETS_RESPONSE.markets[0],
        baseAsset: {
          ...MARKETS_RESPONSE.markets[0].baseAsset,
          logoURI: BTC_LOGO,
        },
      },
    ],
  }

  // Viewer (account 42) closes a long: was long 1 @ entry 40000, sells 1 @
  // 50000 → realized PnL (50000 - 40000) × 1 = 10000.
  const REDUCING_TRADE = {
    trade_id: 9,
    tx_hash: '0xfeed',
    type: 'trade',
    market_id: 0,
    size: '1',
    price: '50000',
    usd_amount: '50000',
    ask_id: 7,
    bid_id: 8,
    ask_account_id: 42,
    bid_account_id: 0,
    is_maker_ask: false,
    block_height: 1,
    timestamp: 1_700_000_000_000,
    taker_fee: 0.5,
    maker_fee: 0.2,
    transaction_time: 1_700_000_000_000,
    taker_position_size_before: '1',
    maker_position_size_before: '0',
    taker_entry_quote_before: '40000',
    maker_entry_quote_before: '0',
  }

  it('threads the backend registry logoURI onto fills and derives realizedPnl', async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url)
      recorded.push({ url: u })
      if (u.includes('backend.test/v1/perps/markets')) {
        return respond(MARKETS_WITH_LOGO)
      }
      if (u.includes('/api/v1/account?')) {
        return respond(ACCOUNT_PAYLOAD)
      }
      if (u.includes('/api/v1/trades')) {
        return respond({ code: 0, next_cursor: '', trades: [REDUCING_TRADE] })
      }
      throw new Error(`Unhandled URL in test: ${u}`)
    })

    const provider = lighterProvider({ authToken: 'tok' })
    provider.bind(STUB_CLIENT)
    const result = await provider.getFills({ address: ADDRESS })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].market.baseAsset.logoURI).toBe(BTC_LOGO)
    expect(result.items[0].realizedPnl).toBe('10000')
  })
})

describe('LighterProvider — accountExists', () => {
  it('returns true when the account resolves', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    await expect(provider.accountExists({ address: ADDRESS })).resolves.toBe(
      true
    )
  })

  it('returns false when Lighter reports the account-not-found body code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('/api/v1/account?')) {
          return respond({ code: LIGHTER_CODE_ACCOUNT_NOT_FOUND }, 400)
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    await expect(provider.accountExists({ address: ADDRESS })).resolves.toBe(
      false
    )
  })

  it('rethrows on a non-account-not-found account error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('/api/v1/account?')) {
          return new Response('boom', { status: 500 })
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    await expect(provider.accountExists({ address: ADDRESS })).rejects.toThrow()
  })
})
