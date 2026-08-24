import {
  createMemoryStorage,
  ETHEREUM_NATIVE_GAS,
  ETHEREUM_USDC,
  LIGHTER_USDC,
  PerpsError,
  type PerpsSDKClient,
  ROBINHOOD_USDG,
} from '@lifi/perps-sdk'
import {
  ActionType,
  ActivityType,
  type EvmTxActionStep,
  LiquidityRole,
  MarginMode,
  OrderSide,
  PerpsErrorCode,
  PerpsSigner,
  PositionMarginAdjustment,
  SigningMethod,
  type WasmBlobActionStep,
} from '@lifi/perps-types'
import { createWalletClient, custom } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LIGHTER_EXPLORER_TX_BASE_URL,
  DEFAULT_LIGHTER_REST_URL,
  LIGHTER_CODE_ACCOUNT_NOT_FOUND,
  LIGHTER_MAINNET_DEPLOYMENT,
  LIGHTER_PROVIDER_KEY,
  LIGHTER_RH_DEPLOYMENT,
  LIGHTER_RH_PROVIDER_KEY,
  LIGHTER_RH_REST_URL,
} from './constants.js'
import {
  type LighterPerpsProvider,
  type LighterProviderOptions,
  lighterProvider,
  lighterRhProvider,
} from './LighterProvider.js'

// The provider builds its own `LighterSigner`, so the Go runtime is the only
// seam left for tests: this fake records the deployment facts each instance
// initializes its signer with and mints deterministic auth tokens.
const wasm = vi.hoisted(() => {
  const createClientCalls: {
    url: string
    chainId: number
    apiKeyIndex: number
    accountIndex: number
  }[] = []
  let authTokenCalls = 0
  return {
    createClientCalls,
    get authTokenCalls() {
      return authTokenCalls
    },
    reset() {
      createClientCalls.length = 0
      authTokenCalls = 0
    },
    exports: {
      GenerateAPIKey: () => ({
        publicKey: `0x${'aa'.repeat(32)}`,
        privateKey: `0x${'bb'.repeat(32)}`,
      }),
      CreateClient: (
        url: string,
        _privateKey: string,
        chainId: number,
        apiKeyIndex: number,
        accountIndex: number
      ) => {
        createClientCalls.push({ url, chainId, apiKeyIndex, accountIndex })
        return {}
      },
      CreateAuthToken: () => {
        authTokenCalls += 1
        return { authToken: `std-${authTokenCalls}` }
      },
    },
  }
})

vi.mock('./signers/wasmLoader.js', () => ({
  loadLighterWasm: async () => wasm.exports,
  resetLighterWasmCache: () => {},
}))

/** Persisted Lighter API key the provider-owned key store reads on a cold start. */
const STORED_API_KEY = {
  accountIndex: 42,
  apiKeyIndex: 42,
  apiKeyPrivateKey: `0x${'cc'.repeat(32)}`,
  apiKeyPublicKey: `0x${'dd'.repeat(32)}`,
}

/**
 * Storage key `LighterKeyStore` persists under — the default `lighter`
 * instance keeps the un-namespaced key, every other deployment gets a segment.
 */
const apiKeyStorageKey = (providerKey: string, address: string): string =>
  providerKey === LIGHTER_PROVIDER_KEY
    ? `lifi-perps-lighter-key:${address.toLowerCase()}`
    : `lifi-perps-lighter-key:${providerKey}:${address.toLowerCase()}`

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
      positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
      funding: { rate: '0.0001', nextFundingTime: 0 },
    },
  ],
}

const PROVIDERS_RESPONSE = {
  providers: [
    {
      key: 'lighter',
      categories: [
        {
          id: 'lighter',
          quoteAsset: {
            providerId: 'lighter',
            id: 'USDC',
            displaySymbol: 'USDC',
            logoURI: '',
          },
        },
        { id: 'spot', quoteAsset: null },
      ],
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
      cross_initial_margin_requirement: '120',
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
// `used_code` the default `/referral/userReferrals` handler returns — the
// referral code currently applied to the account ('' = none). Mutable so a
// test can drive the applied/not-applied branches of `referralPresent`.
let userReferralsUsedCode = ''

/**
 * Per-test handler consulted before the shared defaults. Returning `undefined`
 * falls through, so a test overrides only the endpoints it cares about while
 * still exercising the real `defaultLighterTokenFetcher` / REST plumbing.
 */
type FetchOverride = (
  url: string,
  init: RequestInit | undefined
) => Response | Promise<Response> | undefined

let fetchOverride: FetchOverride | undefined

const overrideFetch = (handler: FetchOverride): void => {
  fetchOverride = handler
}

/** Read a form field off a recorded `tokens/create` multipart POST. */
const formField = (init: RequestInit | undefined, name: string): string =>
  init?.body instanceof FormData ? String(init.body.get(name)) : ''

const respond = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** Lighter's `tokens/create` success body for the seeded account. */
const readOnlyTokenResponse = (apiToken: string) => ({
  api_token: apiToken,
  account_index: STORED_API_KEY.accountIndex,
  expiry: FAR_EXPIRY_SECONDS,
  scopes: 'all',
})

beforeEach(() => {
  recorded = []
  userReferralsUsedCode = ''
  fetchOverride = undefined
  wasm.reset()
  fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    const overridden = await fetchOverride?.(u, init)
    if (overridden !== undefined) {
      if (!u.includes('backend.test/')) {
        recorded.push({ url: u, init })
      }
      return overridden
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
    recorded.push({ url: u, init })
    if (u.includes('/api/v1/tokens/create')) {
      return respond(readOnlyTokenResponse('ro-readonly-lighter'))
    }
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
    if (u.includes('/api/v1/referral/userReferrals')) {
      return respond({ code: 0, used_code: userReferralsUsedCode })
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

  it('declares SET_REFERRAL as an internal setup action', () => {
    expect(lighterProvider().internalSetupActions).toContain(
      ActionType.SET_REFERRAL
    )
  })
})

describe('LighterProvider — provider-owned credential stores', () => {
  it('persists the mainnet API key under the un-namespaced storage key', async () => {
    const storage = createMemoryStorage()
    await storage.set(
      apiKeyStorageKey(LIGHTER_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )
    const provider = lighterProvider({ storage })
    provider.bind(STUB_CLIENT)

    await provider.getAccount({ address: ADDRESS })

    // The instance read its own store: the seeded key authorised a token create.
    expect(recorded.some((r) => r.url.includes('/api/v1/tokens/create'))).toBe(
      true
    )
  })

  it('namespaces the RH instance key store away from mainnet on a shared adapter', async () => {
    const storage = createMemoryStorage()
    await storage.set(
      apiKeyStorageKey(LIGHTER_RH_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )
    const mainnet = lighterProvider({ storage })
    mainnet.bind(STUB_CLIENT)

    await mainnet.getAccount({ address: ADDRESS })

    // Only the RH namespace holds a key, so mainnet finds none and degrades.
    expect(recorded.some((r) => r.url.includes('/api/v1/tokens/create'))).toBe(
      false
    )
    await expect(
      storage.get(apiKeyStorageKey(LIGHTER_PROVIDER_KEY, ADDRESS))
    ).resolves.toBeNull()
  })

  it('does not expose signer, key-store or WASM injection seams', () => {
    // A stray injected dependency would be silently ignored, so the contract is
    // the option surface itself: only consumer-level overrides are accepted.
    const optionKeys: (keyof LighterProviderOptions)[] = [
      'storage',
      'restUrl',
      'authToken',
      'tokenLifetimeSeconds',
      'tokenRenewBufferSeconds',
    ]
    const options: LighterProviderOptions = Object.fromEntries(
      optionKeys.map((key) => [key, undefined])
    )
    expect(Object.keys(options).sort()).toEqual([...optionKeys].sort())
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
    overrideFetch((url) =>
      url.includes('/api/v1/accountLimits')
        ? new Response('boom', { status: 500 })
        : undefined
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
    const storage = createMemoryStorage()
    await storage.set(
      apiKeyStorageKey(LIGHTER_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )
    const provider = lighterProvider({ storage })
    provider.bind(STUB_CLIENT)

    await provider.getAccount({ address: ADDRESS })

    // Standard (read-write) token is signed exactly once — only to authorise
    // the read-only token creation, never to authenticate the read itself.
    expect(wasm.authTokenCalls).toBe(1)
    const createCall = recorded.find((r) =>
      r.url.includes('/api/v1/tokens/create')
    )
    expect(new Headers(createCall?.init?.headers).get('authorization')).toMatch(
      /^std-\d+$/
    )
    expect(formField(createCall?.init, 'account_index')).toBe(
      String(STORED_API_KEY.accountIndex)
    )
    const limitsCall = recorded.find((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsCall?.url).toContain('auth=ro-readonly-lighter')
  })

  it('creates the read-only token at most once and reuses it across reads', async () => {
    const storage = createMemoryStorage()
    await storage.set(
      apiKeyStorageKey(LIGHTER_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )
    const provider = lighterProvider({ storage })
    provider.bind(STUB_CLIENT)

    await provider.getAccount({ address: ADDRESS })
    await provider.getAccount({ address: ADDRESS })

    // tokens/create hit exactly once across both reads; the second read reuses
    // the persisted token and so never re-signs a standard token either.
    expect(
      recorded.filter((r) => r.url.includes('/api/v1/tokens/create'))
    ).toHaveLength(1)
    expect(wasm.authTokenCalls).toBe(1)
    const limitsCalls = recorded.filter((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsCalls).toHaveLength(2)
    for (const call of limitsCalls) {
      expect(call.url).toContain('auth=ro-readonly-lighter')
    }
  })

  it('skips on-demand creating when no API key is registered for the address', async () => {
    const provider = lighterProvider({ storage: createMemoryStorage() })
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount({ address: ADDRESS })
    // No API key → falls back to the unauthenticated degrade path (zero fee tier).
    expect(account.feeTier).toEqual({ maker: '0', taker: '0' })
    // `account_trading_mode` from DetailedAccount is threaded into the config.
    expect(account.config).toMatchObject({ accountTradingMode: 1 })
    expect(wasm.authTokenCalls).toBe(0)
    expect(recorded.some((r) => r.url.includes('/api/v1/tokens/create'))).toBe(
      false
    )
  })
})

describe('LighterProvider — referralPresent', () => {
  // Deliberately not a real attribution code — the expected value is
  // backend-owned runtime metadata, so tests only ever use a synthetic one.
  const RUNTIME_CODE = 'TEST-REF-CODE'

  /**
   * Serve `/providers` metadata whose entries carry the given `referralCode`
   * per provider key (`undefined` = descriptor without a code). Other backend
   * endpoints fall through to the shared defaults.
   */
  const stubProvidersMetadata = (
    codeByProviderKey: Record<string, string | undefined>,
    onBackendRequest?: (url: string, init: RequestInit | undefined) => void
  ): void => {
    overrideFetch((url, init) => {
      if (url.includes('backend.test/')) {
        onBackendRequest?.(url, init)
      }
      if (url.includes('backend.test/v1/perps/providers')) {
        return respond({
          providers: Object.entries(codeByProviderKey).map(
            ([key, referralCode]) => ({
              ...PROVIDERS_RESPONSE.providers[0],
              key,
              ...(referralCode === undefined ? {} : { referralCode }),
            })
          ),
        })
      }
      return undefined
    })
  }

  it('is true and reads the applied referral authenticated by L1 address when the runtime code is applied', async () => {
    stubProvidersMetadata({ lighter: RUNTIME_CODE })
    userReferralsUsedCode = RUNTIME_CODE
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount(
      { address: ADDRESS },
      { lighterAuthToken: 'ref-token' }
    )
    expect(account.config).toMatchObject({ referralPresent: true })
    const call = recorded.find((r) =>
      r.url.includes('/api/v1/referral/userReferrals')
    )
    expect(call).toBeDefined()
    expect(call?.url).toContain('auth=ref-token')
    expect(call?.url).toContain(`l1_address=${ADDRESS.toLowerCase()}`)
  })

  it('never sends the Lighter auth token to the LI.FI backend', async () => {
    const backendRequests: Recorded[] = []
    stubProvidersMetadata({ lighter: RUNTIME_CODE }, (url, init) => {
      backendRequests.push({ url, init })
    })
    userReferralsUsedCode = RUNTIME_CODE
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    await provider.getAccount(
      { address: ADDRESS },
      { lighterAuthToken: 'ref-token' }
    )
    expect(backendRequests.length).toBeGreaterThan(0)
    for (const req of backendRequests) {
      expect(req.url).not.toContain('ref-token')
      const headers = JSON.stringify([
        ...new Headers(req.init?.headers).entries(),
      ])
      expect(headers).not.toContain('ref-token')
      expect(String(req.init?.body ?? '')).not.toContain('ref-token')
    }
  })

  it('is false when a different referral code is applied', async () => {
    stubProvidersMetadata({ lighter: RUNTIME_CODE })
    userReferralsUsedCode = 'SOMEONE-ELSE'
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount(
      { address: ADDRESS },
      { lighterAuthToken: 'ref-token' }
    )
    expect(account.config).toMatchObject({ referralPresent: false })
  })

  it('is false when no referral is applied', async () => {
    stubProvidersMetadata({ lighter: RUNTIME_CODE })
    userReferralsUsedCode = ''
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount(
      { address: ADDRESS },
      { lighterAuthToken: 'ref-token' }
    )
    expect(account.config).toMatchObject({ referralPresent: false })
  })

  it('skips the read and reports false when runtime metadata carries no referralCode', async () => {
    // Shared default `/providers` fixture — descriptor without a referralCode.
    userReferralsUsedCode = RUNTIME_CODE
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount(
      { address: ADDRESS },
      { lighterAuthToken: 'ref-token' }
    )
    expect(account.config).toMatchObject({ referralPresent: false })
    expect(
      recorded.find((r) => r.url.includes('/api/v1/referral/userReferrals'))
    ).toBeUndefined()
  })

  it('skips the read and reports false when no auth token is available', async () => {
    stubProvidersMetadata({ lighter: RUNTIME_CODE })
    userReferralsUsedCode = RUNTIME_CODE
    const provider = lighterProvider({ storage: createMemoryStorage() })
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount({ address: ADDRESS })
    expect(account.config).toMatchObject({ referralPresent: false })
    expect(
      recorded.find((r) => r.url.includes('/api/v1/referral/userReferrals'))
    ).toBeUndefined()
  })

  it("selects metadata by instance key — RH never compares against mainnet's code", async () => {
    stubProvidersMetadata({
      lighter: RUNTIME_CODE,
      [LIGHTER_RH_PROVIDER_KEY]: undefined,
    })
    userReferralsUsedCode = RUNTIME_CODE
    const provider = lighterRhProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount(
      { address: ADDRESS },
      { lighterAuthToken: 'ref-token' }
    )
    expect(account.config).toMatchObject({ referralPresent: false })
    expect(
      recorded.find((r) => r.url.includes('/api/v1/referral/userReferrals'))
    ).toBeUndefined()
  })

  it('resolves the RH code from the RH descriptor', async () => {
    stubProvidersMetadata({
      lighter: 'MAINNET-ONLY-CODE',
      [LIGHTER_RH_PROVIDER_KEY]: RUNTIME_CODE,
    })
    userReferralsUsedCode = RUNTIME_CODE
    const provider = lighterRhProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount(
      { address: ADDRESS },
      { lighterAuthToken: 'ref-token' }
    )
    expect(account.config).toMatchObject({ referralPresent: true })
  })
})

describe('LighterProvider — assetCollateral projection', () => {
  const accountWithAssets = (assets: unknown[]) => ({
    ...ACCOUNT_PAYLOAD,
    accounts: [{ ...ACCOUNT_PAYLOAD.accounts[0], assets }],
  })

  const stubAccount = (assets: unknown[]) => {
    const payload = accountWithAssets(assets)
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
        if (u.includes('backend.test/v1/perps/providers')) {
          return respond(PROVIDERS_RESPONSE)
        }
        if (u.includes('/api/v1/account?')) {
          return respond(payload)
        }
        if (u.includes('/api/v1/orderBookDetails')) {
          return respond(ORDER_BOOK_DETAILS_PAYLOAD)
        }
        if (u.includes('/api/v1/apikeys')) {
          return respond(APIKEYS_EMPTY)
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )
  }

  it("decodes each held asset's margin_mode into an enabled flag", async () => {
    stubAccount([
      {
        symbol: 'BTC',
        asset_id: 0,
        balance: '1',
        locked_balance: '0',
        margin_balance: '0',
        multiplier: '1.000000000000000000',
        margin_mode: 'enabled',
      },
      {
        symbol: 'USDC',
        asset_id: 3,
        balance: '5',
        locked_balance: '0',
        margin_balance: '0',
        multiplier: '1.000000000000000000',
        margin_mode: 'disabled',
      },
    ])
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount({ address: ADDRESS })
    expect(account.config).toMatchObject({
      provider: 'lighter',
      assetCollateral: [
        { assetId: '0', enabled: true },
        { assetId: '3', enabled: false },
      ],
    })
  })

  it('omits assets whose margin_mode Lighter does not surface', async () => {
    stubAccount([
      {
        symbol: 'BTC',
        asset_id: 0,
        balance: '1',
        locked_balance: '0',
        margin_balance: '0',
        multiplier: '1.000000000000000000',
        margin_mode: 'enabled',
      },
      {
        symbol: 'ETH',
        asset_id: 5,
        balance: '2',
        locked_balance: '0',
        margin_balance: '0',
        multiplier: '1.000000000000000000',
      },
    ])
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount({ address: ADDRESS })
    expect(account.config).toMatchObject({
      assetCollateral: [{ assetId: '0', enabled: true }],
    })
  })
})

describe('LighterProvider — getWithdrawableBalances', () => {
  // `assets` captured verbatim from live
  // `GET https://mainnet.zklighter.elliot.ai/api/v1/account?by=index&value=12`.
  const LIVE_ASSETS = [
    {
      symbol: 'ETH',
      asset_id: 1,
      balance: '0.00609091',
      locked_balance: '0.00000000',
      margin_mode: 'disabled',
      margin_balance: '0.00000000',
      multiplier: '1.000000000000000000',
    },
    {
      symbol: 'USDC',
      asset_id: 3,
      balance: '10.988600',
      locked_balance: '0.000000',
      margin_mode: 'disabled',
      margin_balance: '11.009697536',
      multiplier: '1.000000000000000000',
    },
  ]

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('/api/v1/account?')) {
          return respond({
            ...ACCOUNT_PAYLOAD,
            accounts: [{ ...ACCOUNT_PAYLOAD.accounts[0], assets: LIVE_ASSETS }],
          })
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )
  })

  it('reports one row per funded (asset, route) pair', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    await expect(
      provider.getWithdrawableBalances!({ address: ADDRESS })
    ).resolves.toEqual([
      { assetId: '1', route: 'spot', available: '0.00609091' },
      { assetId: '3', route: 'spot', available: '10.9886' },
      { assetId: '3', route: 'perps', available: '11.009697536' },
    ])
  })
})

describe('LighterProvider — getAccount balance asset identity', () => {
  const USDC_LOGO = 'https://cdn.test/usdc.png'
  const BTC_LOGO = 'https://cdn.test/btc.png'

  const PROVIDERS_WITH_LOGO = {
    providers: [
      {
        key: 'lighter',
        categories: [
          {
            id: 'lighter',
            quoteAsset: {
              providerId: 'lighter',
              id: 'USDC',
              displaySymbol: 'USDC',
              logoURI: USDC_LOGO,
            },
          },
          { id: 'spot', quoteAsset: null },
        ],
      },
    ],
  }

  const ASSETS_WITH_LOGO = {
    assets: [
      {
        providerId: 'lighter',
        id: '3',
        displaySymbol: 'USDC',
        logoURI: USDC_LOGO,
      },
      {
        providerId: 'lighter',
        id: '0',
        displaySymbol: 'BTC',
        logoURI: BTC_LOGO,
      },
    ],
  }

  const ACCOUNT_WITH_SPOT = {
    ...ACCOUNT_PAYLOAD,
    accounts: [
      {
        ...ACCOUNT_PAYLOAD.accounts[0],
        cross_asset_value: '450',
        assets: [
          {
            symbol: 'USDC',
            asset_id: 3,
            balance: '10',
            locked_balance: '0',
            margin_mode: 0,
          },
          {
            symbol: 'BTC',
            asset_id: 0,
            balance: '2',
            locked_balance: '0',
            margin_mode: 1,
          },
        ],
      },
    ],
  }

  let accountPayload = ACCOUNT_WITH_SPOT

  beforeEach(() => {
    accountPayload = ACCOUNT_WITH_SPOT
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('backend.test/v1/perps/markets')) {
          return respond(MARKETS_RESPONSE)
        }
        if (u.includes('backend.test/v1/perps/assets')) {
          return respond(ASSETS_WITH_LOGO)
        }
        if (u.includes('backend.test/v1/perps/providers')) {
          return respond(PROVIDERS_WITH_LOGO)
        }
        if (u.includes('/api/v1/account?')) {
          return respond(accountPayload)
        }
        if (u.includes('/api/v1/orderBookDetails')) {
          return respond(ORDER_BOOK_DETAILS_PAYLOAD)
        }
        if (u.includes('/api/v1/apikeys')) {
          return respond(APIKEYS_EMPTY)
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )
  })

  it('resolves the collateral (USDC) asset from the provider category metadata, carrying its logoURI', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount({ address: ADDRESS })

    expect(account.collateralBalances).toHaveLength(1)
    expect(account.collateralBalances[0].asset).toMatchObject({
      id: 'USDC',
      displaySymbol: 'USDC',
      logoURI: USDC_LOGO,
    })
    // Cross availability comes only from Lighter's cross pool:
    // cross_asset_value (450) − cross_initial_margin_requirement (120).
    // Top-level collateral (500) also includes isolated allocations.
    expect(account.collateralBalances[0].units).toBe('330')
    expect(account.collateralBalances[0].valueUsd).toBe('330')
  })

  it('rejects malformed current cross-pool fields', async () => {
    accountPayload = {
      ...ACCOUNT_WITH_SPOT,
      accounts: [
        {
          ...ACCOUNT_WITH_SPOT.accounts[0],
          cross_asset_value: 'not-a-decimal',
        },
      ],
    }
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)

    await expect(provider.getAccount({ address: ADDRESS })).rejects.toThrow(
      /cross_asset_value/
    )
  })

  it('resolves spot balance assets from the backend asset registry by asset_id, carrying their logoURI', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount({ address: ADDRESS })

    const usdc = account.balances.find((b) => b.asset.displaySymbol === 'USDC')
    const btc = account.balances.find((b) => b.asset.displaySymbol === 'BTC')
    expect(usdc?.asset.logoURI).toBe(USDC_LOGO)
    expect(btc?.asset.logoURI).toBe(BTC_LOGO)
    // AC5: USDC spot is valued 1:1; other tokens have no price source here.
    expect(usdc?.units).toBe('10')
    expect(usdc?.valueUsd).toBe('10')
    expect(btc?.units).toBe('2')
    expect(btc?.valueUsd).toBe('0')
  })
})

describe('LighterProvider — deployment-aware collateral display', () => {
  // The RH deployment holds USDG in asset slot 3 — the slot mainnet holds USDC
  // in — alongside its equity tokens, so only the instance disambiguates them.
  const RH_ACCOUNT = {
    ...ACCOUNT_PAYLOAD,
    accounts: [
      {
        ...ACCOUNT_PAYLOAD.accounts[0],
        cross_asset_value: '450',
        assets: [
          {
            symbol: 'USDG',
            asset_id: 3,
            balance: '10',
            locked_balance: '0',
            margin_mode: 0,
          },
          {
            symbol: 'AAPL',
            asset_id: 4,
            balance: '2',
            locked_balance: '0',
            margin_mode: 1,
          },
        ],
      },
    ],
  }

  // The backend serves no asset registry for this instance, so the spot
  // descriptors fall back to the account payload's own symbols.
  const stubFetch = (providersPayload: unknown) => {
    overrideFetch((url) => {
      if (url.includes('backend.test/v1/perps/assets')) {
        return respond({ assets: [] })
      }
      if (url.includes('backend.test/v1/perps/providers')) {
        return respond(providersPayload)
      }
      if (url.includes('/api/v1/account?')) {
        return respond(RH_ACCOUNT)
      }
      return undefined
    })
  }

  /** Fresh client per call — the market/asset registries are cached per client. */
  const accountFrom = (provider: LighterPerpsProvider) => {
    provider.bind({
      config: { apiUrl: 'https://backend.test/v1/perps' },
    } as PerpsSDKClient)
    return provider.getAccount({ address: ADDRESS })
  }

  it('falls back to the RH deployment collateral (USDG) when the backend has no RH category', async () => {
    stubFetch(PROVIDERS_RESPONSE)
    const account = await accountFrom(lighterRhProvider())
    expect(account.collateralBalances[0].asset).toEqual({
      providerId: LIGHTER_RH_PROVIDER_KEY,
      id: 'USDG',
      displaySymbol: 'USDG',
      logoURI: '',
    })
  })

  it('falls back to USDC for the mainnet instance', async () => {
    stubFetch({ providers: [] })
    const account = await accountFrom(lighterProvider())
    expect(account.collateralBalances[0].asset).toEqual({
      providerId: LIGHTER_PROVIDER_KEY,
      id: 'USDC',
      displaySymbol: 'USDC',
      logoURI: '',
    })
  })

  it("values the RH deployment's own collateral 1:1 and leaves its equity tokens unpriced", async () => {
    stubFetch(PROVIDERS_RESPONSE)
    const account = await accountFrom(lighterRhProvider())
    expect(account.balances).toEqual([
      {
        categoryId: 'spot',
        asset: {
          providerId: LIGHTER_RH_PROVIDER_KEY,
          id: '3',
          displaySymbol: 'USDG',
          logoURI: '',
        },
        units: '10',
        valueUsd: '10',
      },
      {
        categoryId: 'spot',
        asset: {
          providerId: LIGHTER_RH_PROVIDER_KEY,
          id: '4',
          displaySymbol: 'AAPL',
          logoURI: '',
        },
        units: '2',
        valueUsd: '0',
      },
    ])
  })
})

describe('LighterProvider — getAccount balance categoryId', () => {
  // Fixture category ids match nothing else (provider key, markets fixture,
  // 'spot' constant), so these assertions can only pass via /providers.
  const PERPS_CATEGORY_ID = 'perps'
  const SPOT_CATEGORY_ID_FROM_METADATA = 'cash'
  const PROVIDERS_PERPS_CATEGORY = {
    providers: [
      {
        key: 'lighter',
        categories: [
          {
            id: PERPS_CATEGORY_ID,
            quoteAsset: {
              providerId: 'lighter',
              id: 'USDC',
              displaySymbol: 'USDC',
              logoURI: 'https://cdn.test/usdc-category.png',
            },
          },
          { id: SPOT_CATEGORY_ID_FROM_METADATA, quoteAsset: null },
        ],
      },
    ],
  }
  const ACCOUNT_WITH_SPOT = {
    ...ACCOUNT_PAYLOAD,
    accounts: [
      {
        ...ACCOUNT_PAYLOAD.accounts[0],
        assets: [
          { symbol: 'USDC', asset_id: 3, balance: '10', locked_balance: '0' },
          { symbol: 'BTC', asset_id: 0, balance: '2', locked_balance: '0' },
        ],
      },
    ],
  }

  beforeEach(() => {
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
        if (u.includes('backend.test/v1/perps/providers')) {
          return respond(PROVIDERS_PERPS_CATEGORY)
        }
        if (u.includes('/api/v1/account?')) {
          return respond(ACCOUNT_WITH_SPOT)
        }
        if (u.includes('/api/v1/orderBookDetails')) {
          return respond(ORDER_BOOK_DETAILS_PAYLOAD)
        }
        if (u.includes('/api/v1/apikeys')) {
          return respond(APIKEYS_EMPTY)
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )
  })

  it('labels collateral with the fixed-quote category from /providers, not the provider key or markets', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount({ address: ADDRESS })

    expect(account.collateralBalances).toHaveLength(1)
    expect(account.collateralBalances[0].categoryId).toBe(PERPS_CATEGORY_ID)
    expect(account.collateralBalances[0].asset.logoURI).toBe(
      'https://cdn.test/usdc-category.png'
    )
  })

  it('labels spot token holdings with the null-quote category id from /providers', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount({ address: ADDRESS })

    expect(account.balances.length).toBeGreaterThan(0)
    for (const balance of account.balances) {
      expect(balance.categoryId).toBe(SPOT_CATEGORY_ID_FROM_METADATA)
    }
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
    const storage = createMemoryStorage()
    await storage.set(
      apiKeyStorageKey(LIGHTER_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )

    let createCount = 0
    let limitsCalls = 0
    overrideFetch((url) => {
      if (url.includes('/api/v1/tokens/create')) {
        createCount += 1
        return respond(
          readOnlyTokenResponse(createCount === 1 ? 'ro-stale' : 'ro-fresh')
        )
      }
      if (url.includes('/api/v1/accountLimits')) {
        limitsCalls += 1
        return url.includes('auth=ro-stale')
          ? staleLimits()
          : respond(LIMITS_OK)
      }
      return undefined
    })

    const provider = lighterProvider({ storage })
    provider.bind(STUB_CLIENT)

    const account = await provider.getAccount({ address: ADDRESS })

    expect(createCount).toBe(2) // stale, then fresh after eviction
    expect(limitsCalls).toBe(2) // rejected once, retried once
    expect(account.feeTier.maker).not.toBe('0') // recovered read populated fees
    const stored = await storage.get(
      `lifi:perps:lighter:rotoken:${ADDRESS}:${STORED_API_KEY.accountIndex}`
    )
    expect(JSON.parse(stored as string).token).toBe('ro-fresh')
  })

  it('does NOT evict or retry when the caller supplied the auth token', async () => {
    const storage = createMemoryStorage()
    await storage.set(
      apiKeyStorageKey(LIGHTER_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )

    let createCount = 0
    let limitsCalls = 0
    overrideFetch((url) => {
      if (url.includes('/api/v1/tokens/create')) {
        createCount += 1
        return respond(readOnlyTokenResponse('ro-should-not-create'))
      }
      if (url.includes('/api/v1/accountLimits')) {
        limitsCalls += 1
        return new Response('unauthorized', { status: 401 })
      }
      return undefined
    })

    const provider = lighterProvider({ storage })
    provider.bind(STUB_CLIENT)

    // The 401 surfaces rather than being masked as a 0% fee tier; with a
    // caller-supplied token it is not the SDK's to self-heal.
    await expect(
      provider.getAccount(
        { address: ADDRESS },
        { lighterAuthToken: 'caller-token' }
      )
    ).rejects.toThrow()

    expect(createCount).toBe(0) // never created an SDK-owned token
    expect(limitsCalls).toBe(1) // 401 surfaced, not retried
  })
})

describe('LighterProvider — stale API key degrades authed reads', () => {
  // The venue slot was re-registered elsewhere: a different pubkey is live,
  // and every token the stored key signs fails verification.
  const ROTATED_PUBKEY = `0x${'ee'.repeat(32)}`

  it('resolves getAccount with degraded fields and an unsatisfied register gate when the venue rejects every SDK-owned token', async () => {
    const storage = createMemoryStorage()
    await storage.set(
      apiKeyStorageKey(LIGHTER_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    let limitsCalls = 0
    let referralCalls = 0
    overrideFetch((url) => {
      // Carry a runtime referral code so the userReferrals read runs.
      if (url.includes('backend.test/v1/perps/providers')) {
        return respond({
          providers: [
            {
              ...PROVIDERS_RESPONSE.providers[0],
              key: LIGHTER_PROVIDER_KEY,
              referralCode: 'TEST-REF-CODE',
            },
          ],
        })
      }
      if (url.includes('/api/v1/apikeys')) {
        return respond({
          code: 0,
          api_keys: [
            {
              account_index: STORED_API_KEY.accountIndex,
              api_key_index: STORED_API_KEY.apiKeyIndex,
              nonce: 16,
              public_key: ROTATED_PUBKEY,
            },
          ],
        })
      }
      if (url.includes('/api/v1/tokens/create')) {
        return new Response('unauthorized', { status: 401 })
      }
      if (url.includes('/api/v1/accountLimits')) {
        limitsCalls += 1
        return new Response('unauthorized', { status: 401 })
      }
      if (url.includes('/api/v1/referral/userReferrals')) {
        referralCalls += 1
        return new Response('unauthorized', { status: 401 })
      }
      return undefined
    })

    const provider = lighterProvider({ storage })
    provider.bind(STUB_CLIENT)

    const account = await provider.getAccount({ address: ADDRESS })

    // Both reads ran (and retryOnRevoked re-attempted with a re-signed token).
    expect(limitsCalls).toBeGreaterThanOrEqual(1)
    expect(referralCalls).toBeGreaterThanOrEqual(1)

    // Degraded fields: the no-token zero mapping for fees, no referral claim.
    expect(account.feeTier).toEqual({ maker: '0', taker: '0' })
    expect(account.config).toMatchObject({
      apiKeyRegistered: false,
      referralPresent: false,
    })

    // The curative gate projects unsatisfied so the client can re-register.
    const [gate] = provider.projectConfig(
      account.config,
      [
        {
          type: ActionType.REGISTER_API_KEY,
          title: 'Enable Trading',
          description: 'Register a Lighter API key.',
          signers: [PerpsSigner.USER],
          signingMethod: SigningMethod.WASM_BLOB,
          params: [],
        },
      ],
      []
    )
    expect(gate).toMatchObject({
      type: ActionType.REGISTER_API_KEY,
      satisfied: false,
    })

    // The suppressed rejections stay visible in diagnostics.
    const warned = warn.mock.calls.map((c) => String(c[0])).join('\n')
    expect(warned).toContain('/api/v1/accountLimits')
    expect(warned).toContain('/api/v1/referral/userReferrals')
    warn.mockRestore()
  })
})

describe('LighterProvider — API-key slot readout', () => {
  it('reports the slot the stored record names and compares that slot at the venue', async () => {
    const storage = createMemoryStorage()
    const storedKey = { ...STORED_API_KEY, apiKeyIndex: 9 }
    await storage.set(
      apiKeyStorageKey(LIGHTER_PROVIDER_KEY, ADDRESS),
      JSON.stringify(storedKey)
    )
    overrideFetch((url) => {
      if (url.includes('/api/v1/apikeys')) {
        return respond({
          code: 0,
          api_keys: [
            {
              account_index: storedKey.accountIndex,
              api_key_index: 9,
              nonce: 3,
              public_key: storedKey.apiKeyPublicKey,
            },
            // A foreign key in the slot the SDK used to assume.
            {
              account_index: storedKey.accountIndex,
              api_key_index: 42,
              nonce: 1,
              public_key: `0x${'ee'.repeat(32)}`,
            },
          ],
        })
      }
      return undefined
    })

    const provider = lighterProvider({ storage })
    provider.bind(STUB_CLIENT)

    const account = await provider.getAccount({ address: ADDRESS })

    expect(account.config).toMatchObject({
      apiKeyIndex: 9,
      apiKeyRegistered: true,
    })
  })

  it('reports no slot and skips the venue read when no record exists', async () => {
    const provider = lighterProvider({ storage: createMemoryStorage() })
    provider.bind(STUB_CLIENT)

    const account = await provider.getAccount({ address: ADDRESS })

    expect(account.config).toMatchObject({
      apiKeyIndex: undefined,
      apiKeyRegistered: false,
    })
    expect(recorded.some((r) => r.url.includes('/api/v1/apikeys'))).toBe(false)
  })
})

describe('LighterProvider — read-only token creation failure recovery', () => {
  /** Storage holding the user's registered API key for the mainnet instance. */
  const seededStorage = async () => {
    const storage = createMemoryStorage()
    await storage.set(
      apiKeyStorageKey(LIGHTER_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )
    return storage
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('falls back to the standard token only while the backoff window is open, then re-attempts creation', async () => {
    let nowMs = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs)

    const storage = await seededStorage()
    let createCount = 0
    overrideFetch((url) => {
      if (url.includes('/api/v1/tokens/create')) {
        createCount += 1
        return createCount === 1
          ? new Response('tokens/create unavailable', { status: 503 })
          : respond(readOnlyTokenResponse('ro-recovered'))
      }
      return undefined
    })

    const provider = lighterProvider({ storage })
    provider.bind(STUB_CLIENT)

    await provider.getAccount({ address: ADDRESS })
    await provider.getAccount({ address: ADDRESS })
    // Creation failed once; the immediate second read stays on the standard
    // fallback without re-hitting tokens/create.
    expect(createCount).toBe(1)
    const limitsDuringBackoff = recorded.filter((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsDuringBackoff).toHaveLength(2)
    // Both reads ride the same cached standard token — no re-sign.
    for (const call of limitsDuringBackoff) {
      expect(call.url).toContain('auth=std-1')
    }

    nowMs += 31_000 // past the 30s backoff window
    await provider.getAccount({ address: ADDRESS })
    expect(createCount).toBe(2)
    const limitsAfterBackoff = recorded.filter((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(limitsAfterBackoff).toHaveLength(3)
    expect(limitsAfterBackoff[2].url).toContain('auth=ro-recovered')
  })

  it('keeps the requested expiry under the 10-year cap when the client clock runs ahead of the server', async () => {
    const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60
    const CLOCK_SKEW_SECONDS = 60
    const storage = await seededStorage()
    // Server clock runs 60s behind the client; Lighter enforces the 10-year
    // maximum against its own clock and 400s anything beyond it.
    overrideFetch((url, init) => {
      if (!url.includes('/api/v1/tokens/create')) {
        return undefined
      }
      const expiry = Number(formField(init, 'expiry'))
      const serverNowSeconds =
        Math.floor(Date.now() / 1000) - CLOCK_SKEW_SECONDS
      return expiry > serverNowSeconds + TEN_YEARS_SECONDS
        ? new Response('expiry exceeds the maximum', { status: 400 })
        : respond(readOnlyTokenResponse('ro-margin'))
    })

    const provider = lighterProvider({ storage })
    provider.bind(STUB_CLIENT)

    await provider.getAccount({ address: ADDRESS })
    expect(
      recorded.filter((r) => r.url.includes('/api/v1/tokens/create'))
    ).toHaveLength(1)
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
    const storage = createMemoryStorage()
    await storage.set(
      apiKeyStorageKey(LIGHTER_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )
    let limitsCalls = 0
    // Read-only creation is unavailable throughout, so reads ride the
    // standard-token fallback — and the fallback token gets revoked.
    overrideFetch((url) => {
      if (url.includes('/api/v1/tokens/create')) {
        return new Response('tokens/create unavailable', { status: 503 })
      }
      if (url.includes('/api/v1/accountLimits')) {
        limitsCalls += 1
        // std-1 is revoked server-side; only a re-signed token passes.
        return url.includes('auth=std-1')
          ? new Response('unauthorized', { status: 401 })
          : respond(LIMITS_OK)
      }
      return undefined
    })

    const provider = lighterProvider({ storage })
    provider.bind(STUB_CLIENT)

    const account = await provider.getAccount({ address: ADDRESS })

    expect(limitsCalls).toBe(2) // rejected once, retried with the fresh token
    expect(wasm.authTokenCalls).toBe(2) // the revoked token was re-signed, not reused
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
      if (u.includes('backend.test/v1/perps/providers')) {
        return respond(PROVIDERS_RESPONSE)
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
    const storage = createMemoryStorage()
    await storage.set(
      apiKeyStorageKey(LIGHTER_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )

    let createCount = 0
    let activeOrderCalls = 0
    overrideFetch((url) => {
      if (url.includes('/api/v1/account?')) {
        return respond(accountWithOpenOrder)
      }
      if (url.includes('/api/v1/tokens/create')) {
        createCount += 1
        return respond(
          readOnlyTokenResponse(createCount === 1 ? 'ro-stale' : 'ro-fresh')
        )
      }
      if (url.includes('/api/v1/accountActiveOrders')) {
        activeOrderCalls += 1
        return url.includes('auth=ro-stale')
          ? respond({ code: 20013, message: 'invalid auth string' })
          : respond({ code: 0, next_cursor: '', orders: [] })
      }
      return undefined
    })

    const provider = lighterProvider({ storage })
    provider.bind(STUB_CLIENT)

    const orders = await provider.getOrders({ address: ADDRESS })

    expect(createCount).toBe(2) // stale, then fresh after eviction
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
      if (u.includes('backend.test/v1/perps/providers')) {
        return respond(PROVIDERS_RESPONSE)
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

  it('rejects a marketId the Lighter market list does not know', async () => {
    const provider = lighterProvider({ authToken: 'caller-token' })
    provider.bind(STUB_CLIENT)

    await expect(
      provider.getOrders({ address: ADDRESS, marketId: 'LIT/USDC' })
    ).rejects.toMatchObject({
      code: PerpsErrorCode.MarketNotFound,
      tool: 'lighter',
    })
    expect(
      recorded.find((r) => r.url.includes('/api/v1/accountActiveOrders'))
    ).toBeUndefined()
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
      if (u.includes('backend.test/v1/perps/providers')) {
        return respond(PROVIDERS_RESPONSE)
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
      if (u.includes('backend.test/v1/perps/providers')) {
        return respond(PROVIDERS_RESPONSE)
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
    const [item] = result.items
    expect(item.type).toBe(ActivityType.DEPOSIT)
    if (item.type !== ActivityType.DEPOSIT) {
      throw new Error('expected a deposit activity')
    }
    expect(item.explorerLink).toBe('https://scan.li.fi/tx/0xabc')
  })
})

describe('LighterProvider — getActivity liquidation mapping', () => {
  it('never reports the venue liquidation type as a leverage type', async () => {
    overrideFetch((u) =>
      u.includes('/api/v1/liquidations')
        ? respond({
            code: 0,
            liquidations: [
              {
                id: 5,
                market_id: 0,
                type: 'full_liquidation',
                executed_at: 1700000000000,
              },
            ],
          })
        : undefined
    )

    const provider = lighterProvider({ authToken: 'tok' })
    provider.bind(STUB_CLIENT)
    const result = await provider.getActivity({
      address: ADDRESS,
      type: [ActivityType.LIQUIDATION],
    })

    expect(result.items).toHaveLength(1)
    const [item] = result.items
    if (item.type !== ActivityType.LIQUIDATION) {
      throw new Error('expected a liquidation activity')
    }
    expect(item.leverageType).toBeUndefined()
    expect(JSON.stringify(item)).not.toContain('full_liquidation')
    expect(item.liquidatedPositions).toHaveLength(1)
    expect(item.liquidatedPositions[0].market.id).toBe('0')
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
      if (u.includes('backend.test/v1/perps/providers')) {
        return respond(PROVIDERS_RESPONSE)
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
    expect(
      (
        page1.items.find((item) => item.id === 'd1') as
          | { explorerLink?: string }
          | undefined
      )?.explorerLink
    ).toBe('https://scan.li.fi/tx/0xd1')
    expect(
      (
        page1.items.find((item) => item.id === 'w1') as
          | { explorerLink?: string }
          | undefined
      )?.explorerLink
    ).toBe('https://scan.li.fi/tx/0xw1')
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
      if (u.includes('backend.test/v1/perps/providers')) {
        return respond(PROVIDERS_RESPONSE)
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

describe('LighterProvider — getDepositFlow', () => {
  it('swaps into venue collateral when the account resolves', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)
    await expect(
      provider.getDepositFlow!({ address: ADDRESS })
    ).resolves.toEqual({ kind: 'lifiSwap', destination: LIGHTER_USDC })
  })

  it('runs the account-opening pipeline when the account does not exist', async () => {
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
    await expect(
      provider.getDepositFlow!({ address: ADDRESS })
    ).resolves.toEqual({
      kind: 'firstDepositPipeline',
      chainId: ETHEREUM_USDC.chainId,
      gasAsset: ETHEREUM_NATIVE_GAS,
      collateral: ETHEREUM_USDC,
      bridgeAction: ActionType.DEPOSIT,
    })
  })

  it('resolves the Robinhood deployment against its own collateral', async () => {
    const provider = lighterRhProvider()
    provider.bind(STUB_CLIENT)
    await expect(
      provider.getDepositFlow!({ address: ADDRESS })
    ).resolves.toEqual({ kind: 'lifiSwap', destination: ROBINHOOD_USDG })
  })

  it('propagates a non-account-not-found probe error', async () => {
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
    await expect(
      provider.getDepositFlow!({ address: ADDRESS })
    ).rejects.toThrow()
  })
})

describe('LighterProvider — two deployments on one client', () => {
  it('reports each deployment provider key as its own plugin `type`', () => {
    expect(lighterProvider().type).toBe(LIGHTER_PROVIDER_KEY)
    expect(lighterRhProvider().type).toBe(LIGHTER_RH_PROVIDER_KEY)
  })

  it('reads each from its own REST base with its own auth token', async () => {
    const main = lighterProvider()
    const rh = lighterRhProvider()
    main.bind(STUB_CLIENT)
    rh.bind(STUB_CLIENT)

    await main.getAccount(
      { address: ADDRESS },
      { lighterAuthToken: 'main-tok' }
    )
    await rh.getAccount({ address: ADDRESS }, { lighterAuthToken: 'rh-tok' })

    const limitsCalls = recorded.filter((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    const mainCall = limitsCalls.find((r) =>
      r.url.startsWith(DEFAULT_LIGHTER_REST_URL)
    )
    const rhCall = limitsCalls.find((r) =>
      r.url.startsWith(LIGHTER_RH_REST_URL)
    )

    expect(mainCall?.url).toContain('auth=main-tok')
    expect(rhCall?.url).toContain('auth=rh-tok')
    // No token leak: the RH host never sees the mainnet token and vice versa.
    expect(mainCall?.url).not.toContain('rh-tok')
    expect(rhCall?.url).not.toContain('main-tok')
  })

  it('signs each deployment with its own zkLighter chain id and endpoint', async () => {
    const storage = createMemoryStorage()
    await storage.set(
      apiKeyStorageKey(LIGHTER_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )
    await storage.set(
      apiKeyStorageKey(LIGHTER_RH_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )
    const main = lighterProvider({ storage })
    const rh = lighterRhProvider({ storage })
    main.bind(STUB_CLIENT)
    rh.bind(STUB_CLIENT)

    await main.getAccount({ address: ADDRESS })
    await rh.getAccount({ address: ADDRESS })

    expect(wasm.createClientCalls).toEqual([
      {
        url: LIGHTER_MAINNET_DEPLOYMENT.restUrl,
        chainId: LIGHTER_MAINNET_DEPLOYMENT.signerChainId,
        apiKeyIndex: STORED_API_KEY.apiKeyIndex,
        accountIndex: STORED_API_KEY.accountIndex,
      },
      {
        url: LIGHTER_RH_DEPLOYMENT.restUrl,
        chainId: LIGHTER_RH_DEPLOYMENT.signerChainId,
        apiKeyIndex: STORED_API_KEY.apiKeyIndex,
        accountIndex: STORED_API_KEY.accountIndex,
      },
    ])
  })

  it('keeps read-only tokens in separate storage namespaces', async () => {
    const storage = createMemoryStorage()
    await storage.set(
      apiKeyStorageKey(LIGHTER_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )
    await storage.set(
      apiKeyStorageKey(LIGHTER_RH_PROVIDER_KEY, ADDRESS),
      JSON.stringify(STORED_API_KEY)
    )
    overrideFetch((url) =>
      url.includes('/api/v1/tokens/create')
        ? respond(
            readOnlyTokenResponse(
              url.startsWith(LIGHTER_RH_REST_URL) ? 'ro-rh' : 'ro-main'
            )
          )
        : undefined
    )
    const main = lighterProvider({ storage })
    const rh = lighterRhProvider({ storage })
    main.bind(STUB_CLIENT)
    rh.bind(STUB_CLIENT)

    await main.getAccount({ address: ADDRESS })
    await rh.getAccount({ address: ADDRESS })

    const tokenKey = (providerKey: string) =>
      `lifi:perps:${providerKey}:rotoken:${ADDRESS}:${STORED_API_KEY.accountIndex}`
    const mainStored = await storage.get(tokenKey(LIGHTER_PROVIDER_KEY))
    const rhStored = await storage.get(tokenKey(LIGHTER_RH_PROVIDER_KEY))
    expect(JSON.parse(mainStored as string).token).toBe('ro-main')
    expect(JSON.parse(rhStored as string).token).toBe('ro-rh')

    const limitsCalls = recorded.filter((r) =>
      r.url.includes('/api/v1/accountLimits')
    )
    expect(
      limitsCalls.find((r) => r.url.startsWith(DEFAULT_LIGHTER_REST_URL))?.url
    ).toContain('auth=ro-main')
    expect(
      limitsCalls.find((r) => r.url.startsWith(LIGHTER_RH_REST_URL))?.url
    ).toContain('auth=ro-rh')
  })

  it('namespaces the backend markets fetch by provider key per deployment', async () => {
    const backendUrls: string[] = []
    overrideFetch((url) => {
      if (url.includes('backend.test/v1/perps/markets')) {
        backendUrls.push(url)
      }
      return undefined
    })

    // Fresh client so neither instance's market registry is cached from an
    // earlier test (the registry WeakMap is keyed by the client object).
    const client = {
      config: { apiUrl: 'https://backend.test/v1/perps' },
    } as PerpsSDKClient
    const main = lighterProvider()
    const rh = lighterRhProvider()
    main.bind(client)
    rh.bind(client)

    await main.getAccount({ address: ADDRESS })
    await rh.getAccount({ address: ADDRESS })

    expect(backendUrls.some((u) => u.endsWith('provider=lighter'))).toBe(true)
    expect(backendUrls.some((u) => u.endsWith('provider=lighter-rh'))).toBe(
      true
    )
  })
})

describe('LighterProvider — resolveExplorerLink', () => {
  // A Lighter WASM-signed tx hash as the backend echoes it on an execute result.
  const TX_HASH = `0x${'8f2b1c4d'.repeat(8)}`

  it('resolves a submitted tx hash against the mainnet explorer', () => {
    expect(lighterProvider().resolveExplorerLink?.(TX_HASH)).toBe(
      `${DEFAULT_LIGHTER_EXPLORER_TX_BASE_URL}${TX_HASH}`
    )
  })

  it('emits no link for the RH deployment, whose explorer is unpublished', () => {
    expect(lighterRhProvider().resolveExplorerLink?.(TX_HASH)).toBeUndefined()
  })

  it('returns undefined for an empty hash', () => {
    expect(lighterProvider().resolveExplorerLink?.('')).toBeUndefined()
  })
})

describe('LighterProvider — getMarketSettings', () => {
  // Live capture of an isolated BTC position row: IMF 50% ⇒ 2x leverage.
  const ACCOUNT_WITH_ISOLATED_ROW = {
    ...ACCOUNT_PAYLOAD,
    accounts: [
      {
        ...ACCOUNT_PAYLOAD.accounts[0],
        positions: [
          {
            market_id: 0,
            symbol: 'BTC',
            initial_margin_fraction: '50.00',
            open_order_count: 0,
            pending_order_count: 0,
            position_tied_order_count: 0,
            sign: 1,
            position: '0.00019',
            avg_entry_price: '61856.6',
            position_value: '12.352603',
            unrealized_pnl: '-0.006954',
            realized_pnl: '0.000000',
            liquidation_price: '39131.4',
            total_funding_paid_out: '0.000000',
            margin_mode: 1,
            margin_set_flag: 1,
            allocated_margin: '10.179731',
            total_discount: '0.000000',
          },
        ],
      },
    ],
  }

  let accountPayload = ACCOUNT_WITH_ISOLATED_ROW

  beforeEach(() => {
    accountPayload = ACCOUNT_WITH_ISOLATED_ROW
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('/api/v1/account?')) {
          return respond(accountPayload)
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("reads the market's mode and leverage from the account position row", async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)

    await expect(
      provider.getMarketSettings?.({
        address: ADDRESS,
        market: { marketId: '0', categoryId: 'lighter' },
      })
    ).resolves.toEqual({ marginMode: MarginMode.ISOLATED, leverage: 2 })
  })

  it('preserves fractional venue leverage without two-decimal rounding', async () => {
    accountPayload = {
      ...ACCOUNT_WITH_ISOLATED_ROW,
      accounts: [
        {
          ...ACCOUNT_WITH_ISOLATED_ROW.accounts[0],
          positions: [
            {
              ...ACCOUNT_WITH_ISOLATED_ROW.accounts[0].positions[0],
              initial_margin_fraction: '60',
            },
          ],
        },
      ],
    }
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)

    await expect(
      provider.getMarketSettings?.({
        address: ADDRESS,
        market: { marketId: '0', categoryId: 'lighter' },
      })
    ).resolves.toEqual({
      marginMode: MarginMode.ISOLATED,
      leverage: 100 / 60,
    })
  })

  it('does not return a partial setting when leverage is invalid', async () => {
    accountPayload = {
      ...ACCOUNT_WITH_ISOLATED_ROW,
      accounts: [
        {
          ...ACCOUNT_WITH_ISOLATED_ROW.accounts[0],
          positions: [
            {
              ...ACCOUNT_WITH_ISOLATED_ROW.accounts[0].positions[0],
              initial_margin_fraction: '0',
            },
          ],
        },
      ],
    }
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)

    await expect(
      provider.getMarketSettings?.({
        address: ADDRESS,
        market: { marketId: '0', categoryId: 'lighter' },
      })
    ).resolves.toBeUndefined()
  })

  it('resolves undefined for a market without a row', async () => {
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)

    await expect(
      provider.getMarketSettings?.({
        address: ADDRESS,
        market: { marketId: '7', categoryId: 'lighter' },
      })
    ).resolves.toBeUndefined()
  })

  it('resolves undefined for a spot market without a request', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const provider = lighterProvider()
    provider.bind(STUB_CLIENT)

    await expect(
      provider.getMarketSettings?.({
        address: ADDRESS,
        market: { marketId: '2048', categoryId: 'spot' },
      })
    ).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('LighterProvider — signActions arms', () => {
  const WALLET_ACCOUNT = privateKeyToAccount(`0x${'11'.repeat(32)}`)
  const DEPOSIT_TO = `0x${'22'.repeat(20)}` as const
  const DEPOSIT_TX_HASH = `0x${'ab'.repeat(32)}` as const

  /**
   * Wallet client whose transport mines one successful leg and records every
   * broadcast, so a test can assert the leg actually reached the chain.
   */
  const recordingWallet = () => {
    const broadcasts: string[] = []
    const transport = custom({
      async request({ method }) {
        switch (method) {
          case 'eth_chainId':
            return `0x${arbitrum.id.toString(16)}`
          case 'eth_getTransactionCount':
            return '0x0'
          case 'eth_estimateGas':
            return '0x5208'
          case 'eth_maxPriorityFeePerGas':
            return '0x1'
          case 'eth_getBlockByNumber':
            return {
              baseFeePerGas: '0x1',
              number: '0x1',
              timestamp: '0x1',
              gasLimit: '0x1',
              hash: `0x${'00'.repeat(32)}`,
            }
          case 'eth_sendRawTransaction':
            broadcasts.push(DEPOSIT_TX_HASH)
            return DEPOSIT_TX_HASH
          case 'eth_getTransactionReceipt':
            return {
              transactionHash: DEPOSIT_TX_HASH,
              blockNumber: '0x10',
              blockHash: `0x${'bb'.repeat(32)}`,
              status: '0x1',
              from: WALLET_ACCOUNT.address,
              to: DEPOSIT_TO,
              cumulativeGasUsed: '0x1',
              gasUsed: '0x1',
              effectiveGasPrice: '0x1',
              logs: [],
              logsBloom: `0x${'00'.repeat(256)}`,
              contractAddress: null,
              transactionIndex: '0x0',
              type: '0x2',
            }
          default:
            return null
        }
      },
    })
    const wallet = createWalletClient({
      account: WALLET_ACCOUNT,
      chain: arbitrum,
      transport,
    })
    return { wallet, broadcasts }
  }

  const depositStep: EvmTxActionStep = {
    action: ActionType.DEPOSIT,
    txParams: {
      chainId: arbitrum.id,
      to: DEPOSIT_TO,
      functionName: 'deposit',
      args: [`0x${'33'.repeat(20)}`, 100n],
      abi: ['function deposit(address to, uint256 amount) returns (bool)'],
    },
  }

  const orderStep: WasmBlobActionStep = {
    action: ActionType.PLACE_ORDER,
    wasmSignParams: { kind: 'createOrder' },
  }

  // The EVM_TX arm signs with `ctx.userWallet` alone — no WASM signer involved.
  it('broadcasts an EVM_TX leg through the user wallet', async () => {
    const provider = lighterProvider({ storage: createMemoryStorage() })
    provider.bind(STUB_CLIENT)
    const { wallet, broadcasts } = recordingWallet()

    await expect(
      provider.signActions?.(SigningMethod.EVM_TX, [depositStep], ADDRESS, {
        userWallet: wallet,
      })
    ).resolves.toEqual([
      {
        action: ActionType.DEPOSIT,
        txParams: depositStep.txParams,
        txHash: DEPOSIT_TX_HASH,
      },
    ])
    expect(broadcasts).toEqual([DEPOSIT_TX_HASH])
  })

  it('rejects a WASM_BLOB batch when the user has no registered API key', async () => {
    const provider = lighterProvider({ storage: createMemoryStorage() })
    provider.bind(STUB_CLIENT)

    await expect(
      provider.signActions?.(SigningMethod.WASM_BLOB, [orderStep], ADDRESS)
    ).rejects.toMatchObject({
      code: PerpsErrorCode.SDKError,
    })
  })
})
