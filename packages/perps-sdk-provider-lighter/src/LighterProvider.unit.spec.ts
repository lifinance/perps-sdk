import { createMemoryStorage, type PerpsSDKClient } from '@lifi/perps-sdk'
import { ActivityType } from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    expect(provider.type).toBe('lighter')
  })
})

describe('LighterProvider — auth token plumbing', () => {
  it('forwards a per-call `lighterAuthToken` to auth-gated endpoints', async () => {
    const provider = lighterProvider()
    await provider.getAccount(
      STUB_CLIENT,
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

  it('uses a pre-created `authToken` from constructor when no per-call override', async () => {
    const provider = lighterProvider({ authToken: 'pre-created-token' })
    await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
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
    await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
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
    await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
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
    await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
    await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
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
    const account = await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
    // No API key → falls back to the unauthenticated degrade path (zero fee tier).
    expect(account.feeTier).toEqual({ maker: '0', taker: '0' })
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

    const account = await provider.getAccount(STUB_CLIENT, { address: ADDRESS })

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

    await provider.getAccount(
      STUB_CLIENT,
      { address: ADDRESS },
      { lighterAuthToken: 'caller-token' }
    )

    expect(tokenFetcher).toHaveBeenCalledTimes(0) // never created an SDK-owned token
    expect(limitsCalls).toBe(1) // 401 surfaced, not retried
  })
})

describe('LighterProvider — unauthenticated degrade paths', () => {
  it('getAccount returns zero fee tier when no token is configured', async () => {
    const provider = lighterProvider()
    const account = await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
    expect(account.feeTier).toEqual({ maker: '0', taker: '0' })
    // accountLimits should NOT have been called
    expect(
      recorded.find((r) => r.url.includes('/api/v1/accountLimits'))
    ).toBeUndefined()
  })

  it('getOrders returns empty arrays when no token is configured', async () => {
    const provider = lighterProvider()
    const orders = await provider.getOrders(STUB_CLIENT, { address: ADDRESS })
    expect(orders.openOrders).toEqual([])
    expect(orders.triggerOrders).toEqual([])
    expect(orders.pagination.hasMore).toBe(false)
  })

  it('getActivity returns empty items when no token is configured', async () => {
    const provider = lighterProvider()
    const activity = await provider.getActivity(STUB_CLIENT, {
      address: ADDRESS,
    })
    expect(activity.items).toEqual([])
    expect(activity.pagination.hasMore).toBe(false)
  })

  it('getOrder throws when no token is configured', async () => {
    const provider = lighterProvider()
    await expect(
      provider.getOrder(STUB_CLIENT, { address: ADDRESS, id: 'order_1' })
    ).rejects.toThrow(/auth token/i)
  })
})

describe('LighterProvider — direct-REST (no LI.FI backend fallback)', () => {
  it('hits Lighter mainnet by default', async () => {
    const provider = lighterProvider()
    await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
    for (const call of recorded) {
      expect(call.url).toMatch(/^https:\/\/mainnet\.zklighter\.elliot\.ai\//)
    }
  })

  it('respects a custom `restUrl` override', async () => {
    const provider = lighterProvider({
      restUrl: 'https://testnet.zklighter.elliot.ai',
    })
    await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
    for (const call of recorded) {
      expect(call.url).toMatch(/^https:\/\/testnet\.zklighter\.elliot\.ai\//)
    }
  })
})

describe('LighterProvider — normalisation', () => {
  // getPrices / getAssets normalisation now happens server-side (LI.FI backend
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
    const result = await provider.getActivity(STUB_CLIENT, {
      address: ADDRESS,
      type: [ActivityType.DEPOSIT],
    })
    expect(result.pagination.hasMore).toBe(true)
    expect(result.pagination.cursor).toBeTypeOf('string')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].type).toBe(ActivityType.DEPOSIT)
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
    const { items } = await provider.getActivity(STUB_CLIENT, {
      address: ADDRESS,
      type: [ActivityType.TRANSFER],
    })
    const transfer = items.find((i) => i.type === ActivityType.TRANSFER)
    expect(transfer?.asset).toBe('USDC')
  })

  it('falls back to String(asset_id) when the token registry has no symbol', async () => {
    stubWithTransfer(777)
    const provider = lighterProvider({ authToken: 'tok' })
    const { items } = await provider.getActivity(STUB_CLIENT, {
      address: ADDRESS,
      type: [ActivityType.TRANSFER],
    })
    const transfer = items.find((i) => i.type === ActivityType.TRANSFER)
    expect(transfer?.asset).toBe('777')
  })

  it('fetches /perps/assets per getActivity call (no client-side memo; backend caches)', async () => {
    stubWithTransfer(3)
    const provider = lighterProvider({ authToken: 'tok' })
    await provider.getActivity(STUB_CLIENT, {
      address: ADDRESS,
      type: [ActivityType.TRANSFER],
    })
    await provider.getActivity(STUB_CLIENT, {
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
    const txHashShape = '0'.repeat(80) // valid 80-hex shape
    await expect(
      provider.getOrder(STUB_CLIENT, { address: ADDRESS, id: txHashShape })
    ).rejects.toThrow(/looks like a tx hash/)
  })
})
