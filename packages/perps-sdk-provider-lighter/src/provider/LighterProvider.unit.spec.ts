import type { PerpsSDKClient } from '@lifi/perps-sdk'
import { ActivityType } from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LighterProvider } from './LighterProvider.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ADDRESS = '0x1111111111111111111111111111111111111111' as const

// Minimal client stub — the LighterProvider read functions never read from it
// (Lighter goes direct to its REST API; the `client` param is part of the
// `PerpsProvider` contract for cross-provider symmetry).
const STUB_CLIENT = {} as PerpsSDKClient

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
    if (u.includes('/api/v1/assetDetails')) {
      return respond({
        code: 0,
        asset_details: [
          {
            asset_id: 3,
            symbol: 'USDC',
            l1_decimals: 6,
            decimals: 6,
            l1_address: '0xusdc',
          },
        ],
      })
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
    const provider = new LighterProvider()
    expect(provider.type).toBe('lighter')
  })
})

describe('LighterProvider — auth token plumbing', () => {
  it('forwards a per-call `lighterAuthToken` to auth-gated endpoints', async () => {
    const provider = new LighterProvider()
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

  it('uses a pre-minted `authToken` from constructor when no per-call override', async () => {
    const provider = new LighterProvider({ authToken: 'pre-minted-token' })
    await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
    const limitsCall = recorded.find((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsCall?.url).toContain('auth=pre-minted-token')
  })

  it('accepts an async `authToken` source function', async () => {
    let calls = 0
    const provider = new LighterProvider({
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

  it('mints tokens via the WASM signer when `signerContext` is provided', async () => {
    const mintedTokens: string[] = []
    const signerStub = {
      createAuthToken: vi.fn(async (deadline: number) => {
        const t = `minted-${deadline}`
        mintedTokens.push(t)
        return t
      }),
    }
    const provider = new LighterProvider({
      signerContext: {
        signer: signerStub as unknown as Parameters<
          ConstructorParameters<typeof LighterProvider>[0] extends infer T
            ? T extends { signerContext?: infer S }
              ? S extends { signer: infer Sg }
                ? (sg: Sg) => Sg
                : never
              : never
            : never
        >[0],
        context: {
          apiKeyPrivateKey: '0xabc',
          apiKeyIndex: 42,
          accountIndex: 100,
        },
      },
    })
    await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
    expect(signerStub.createAuthToken).toHaveBeenCalledTimes(1)
    expect(mintedTokens.length).toBe(1)
    const limitsCall = recorded.find((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsCall?.url).toContain(`auth=${mintedTokens[0]}`)
  })

  it('reuses a cached signer-minted token across calls until near expiry', async () => {
    const signerStub = {
      createAuthToken: vi.fn(async (deadline: number) => `tok-${deadline}`),
    }
    const provider = new LighterProvider({
      signerContext: {
        signer: signerStub as unknown as Parameters<
          ConstructorParameters<typeof LighterProvider>[0] extends infer T
            ? T extends { signerContext?: infer S }
              ? S extends { signer: infer Sg }
                ? (sg: Sg) => Sg
                : never
              : never
            : never
        >[0],
        context: {
          apiKeyPrivateKey: '0xabc',
          apiKeyIndex: 42,
          accountIndex: 100,
        },
        lifetimeSeconds: 3600,
        renewBufferSeconds: 60,
      },
    })
    await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
    await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
    expect(signerStub.createAuthToken).toHaveBeenCalledTimes(1)
  })

  it('rejects when both authToken and signerContext are supplied', () => {
    expect(
      () =>
        new LighterProvider({
          authToken: 'x',
          signerContext: {
            signer: {} as never,
            context: {
              apiKeyPrivateKey: '0x',
              apiKeyIndex: 1,
              accountIndex: 1,
            },
          },
        })
    ).toThrow(/either.*authToken.*or.*signerContext/i)
  })
})

describe('LighterProvider — unauthenticated degrade paths', () => {
  it('getAccount returns zero fee tier when no token is configured', async () => {
    const provider = new LighterProvider()
    const account = await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
    expect(account.feeTier).toEqual({ maker: '0', taker: '0' })
    // accountLimits should NOT have been called
    expect(
      recorded.find((r) => r.url.includes('/api/v1/accountLimits'))
    ).toBeUndefined()
  })

  it('getOrders returns empty arrays when no token is configured', async () => {
    const provider = new LighterProvider()
    const orders = await provider.getOrders(STUB_CLIENT, { address: ADDRESS })
    expect(orders.openOrders).toEqual([])
    expect(orders.triggerOrders).toEqual([])
    expect(orders.pagination.hasMore).toBe(false)
  })

  it('getActivity returns empty items when no token is configured', async () => {
    const provider = new LighterProvider()
    const activity = await provider.getActivity(STUB_CLIENT, {
      address: ADDRESS,
    })
    expect(activity.items).toEqual([])
    expect(activity.pagination.hasMore).toBe(false)
  })

  it('getOrder throws when no token is configured', async () => {
    const provider = new LighterProvider()
    await expect(
      provider.getOrder(STUB_CLIENT, { address: ADDRESS, id: 'order_1' })
    ).rejects.toThrow(/auth token/i)
  })
})

describe('LighterProvider — direct-REST (no LI.FI backend fallback)', () => {
  it('hits Lighter mainnet by default', async () => {
    const provider = new LighterProvider()
    await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
    for (const call of recorded) {
      expect(call.url).toMatch(/^https:\/\/mainnet\.zklighter\.elliot\.ai\//)
    }
  })

  it('respects a custom `restUrl` override', async () => {
    const provider = new LighterProvider({
      restUrl: 'https://testnet.zklighter.elliot.ai',
    })
    await provider.getAccount(STUB_CLIENT, { address: ADDRESS })
    for (const call of recorded) {
      expect(call.url).toMatch(/^https:\/\/testnet\.zklighter\.elliot\.ai\//)
    }
  })
})

describe('LighterProvider — normalisation', () => {
  it('normalises getPrices into the AssetPrice shape', async () => {
    const provider = new LighterProvider()
    const result = await provider.getPrices(STUB_CLIENT, {})
    expect(result.prices).toEqual([{ assetId: 'BTC', price: '50000' }])
  })

  it('normalises getAssets per perps-types `Asset` shape', async () => {
    const provider = new LighterProvider()
    const result = await provider.getAssets(STUB_CLIENT)
    expect(result.assets).toHaveLength(1)
    const btc = result.assets[0]
    expect(btc).toMatchObject({
      assetId: 'BTC',
      market: 'lighter',
      displaySymbol: 'BTC',
      displayQuote: 'USDC',
      szDecimals: 4,
      onlyIsolated: false,
      markPrice: '50000',
    })
    expect(btc.funding.rate).toBe('0.0001')
  })

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
      if (u.includes('/api/v1/assetDetails')) {
        return respond({ code: 0, asset_details: [] })
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
      throw new Error(`Unhandled URL in test: ${u}`)
    })

    const provider = new LighterProvider({ authToken: 'tok' })
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

describe('LighterProvider — getOrder', () => {
  it('rejects tx-hash-shaped ids with OrderNotFound + guidance', async () => {
    const provider = new LighterProvider({ authToken: 'tok' })
    const txHashShape = '0'.repeat(80) // valid 80-hex shape
    await expect(
      provider.getOrder(STUB_CLIENT, { address: ADDRESS, id: txHashShape })
    ).rejects.toThrow(/looks like a tx hash/)
  })
})
