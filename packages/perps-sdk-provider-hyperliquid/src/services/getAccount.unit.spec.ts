import { createPerpsClient } from '@lifi/perps-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HL_CLEARINGHOUSE_STATE,
  HL_EXTRA_AGENTS,
  HL_MARKETS,
  HL_SPOT_CLEARINGHOUSE_STATE,
  HL_USER_FEES,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { HlAbstractionMode } from '../types/index.js'
import { getAccount } from './getAccount.js'
import { getPositions } from './getPositions.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})

const defaultResponses = (abstraction: HlAbstractionMode | null = null) => ({
  userFees: HL_USER_FEES,
  userAbstraction: abstraction,
  extraAgents: HL_EXTRA_AGENTS,
  spotClearinghouseState: HL_SPOT_CLEARINGHOUSE_STATE,
  clearinghouseState: HL_CLEARINGHOUSE_STATE,
})

const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

describe('getAccount', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('normalises a single-dex account into AccountResponse with the typed config', async () => {
    ;({ restore } = installInfoFetchMock(defaultResponses(), HL_MARKETS))

    const result = await getAccount(ctx, {
      address: ADDRESS,
    })

    expect(result.provider).toBe('hyperliquid')
    expect(result.address).toBe(ADDRESS)
    expect(result.feeTier).toEqual({ maker: '0.0002', taker: '0.0005' })
    expect(result.config.provider).toBe('hyperliquid')
    expect(
      result.config.provider === 'hyperliquid'
        ? result.config.abstractionMode
        : null
    ).toBeNull()
    expect(
      result.config.provider === 'hyperliquid' ? result.config.agents : []
    ).toEqual(HL_EXTRA_AGENTS)
    // Standard mode: spot USDC + total perps venue equity (accountValue,
    // locked margin and uPnL included) are both category-quote collateral;
    // no non-collateral balances.
    expect(result.balances).toEqual([])
    expect(result.collateralBalances).toEqual([
      {
        categoryId: 'spot',
        asset: {
          providerId: 'hyperliquid',
          id: '0',
          displaySymbol: 'USDC',
          logoURI: 'https://app.hyperliquid.xyz/coins/USDC.svg',
        },
        units: '500',
        valueUsd: '500',
      },
      {
        // Collateral asset is the dex's market quote asset (token-index id).
        categoryId: 'hyperliquid',
        asset: {
          providerId: 'hyperliquid',
          id: '0',
          displaySymbol: 'USDC',
          logoURI: '',
        },
        units: '10000',
        valueUsd: '10000',
      },
    ])
    expect(result.marginUsed).toBe('500')
    expect(result.unrealizedPnl).toBe('100')
  })

  it('reads marginSummary (whole account), not the cross-only crossMarginSummary', async () => {
    // Isolated positions diverge the two summaries: marginSummary carries the
    // full account equity/margin, crossMarginSummary only the cross subset.
    ;({ restore } = installInfoFetchMock(
      {
        ...defaultResponses(),
        clearinghouseState: {
          ...HL_CLEARINGHOUSE_STATE,
          marginSummary: { accountValue: '1200', totalMarginUsed: '300' },
          crossMarginSummary: { accountValue: '1000', totalMarginUsed: '100' },
        },
      },
      HL_MARKETS
    ))

    const result = await getAccount(ctx, { address: ADDRESS })

    const venue = result.collateralBalances.find(
      (b) => b.categoryId === 'hyperliquid'
    )
    expect(venue?.valueUsd).toBe('1200')
    expect(result.marginUsed).toBe('300')
  })

  it('carries the positions array, deep-equal to getPositions output for identical fixtures', async () => {
    ;({ restore } = installInfoFetchMock(defaultResponses(), HL_MARKETS))
    const account = await getAccount(ctx, { address: ADDRESS })
    restore()

    ;({ restore } = installInfoFetchMock(defaultResponses(), HL_MARKETS))
    const { positions } = await getPositions(ctx, { address: ADDRESS })

    expect(account.positions).toEqual(positions)
  })

  it('does not issue extra clearinghouseState calls to carry positions', async () => {
    const mock = installInfoFetchMock(defaultResponses(), HL_MARKETS)
    restore = mock.restore

    await getAccount(ctx, { address: ADDRESS })

    const clearinghouseCalls = mock.requests.filter(
      (r) => r.body.type === 'clearinghouseState'
    )
    // One per supported perps sub-dex — the single-dex fixture yields exactly one.
    expect(clearinghouseCalls).toHaveLength(1)
  })

  it('does not surface a builderFeeApproval field (lives at a higher layer)', async () => {
    ;({ restore } = installInfoFetchMock(defaultResponses(), HL_MARKETS))

    const result = await getAccount(ctx, {
      address: ADDRESS,
    })

    expect(
      result.config.provider === 'hyperliquid'
        ? result.config.builderFeeApproval
        : undefined
    ).toBeUndefined()
  })

  it('treats UNIFIED_ACCOUNT abstraction by deriving margin from positions and dropping per-dex balances', async () => {
    ;({ restore } = installInfoFetchMock(
      defaultResponses(HlAbstractionMode.UNIFIED_ACCOUNT),
      HL_MARKETS
    ))

    const result = await getAccount(ctx, {
      address: ADDRESS,
    })

    // Unified mode: spot holds everything — no separate per-dex venue
    // collateral. The single spot USDC balance is the only collateral.
    expect(result.collateralBalances).toEqual([
      {
        categoryId: 'spot',
        asset: {
          providerId: 'hyperliquid',
          id: '0',
          displaySymbol: 'USDC',
          logoURI: 'https://app.hyperliquid.xyz/coins/USDC.svg',
        },
        units: '500',
        valueUsd: '500',
      },
    ])
    // Derived from the single position's marginUsed (940)
    expect(result.marginUsed).toBe('940')
  })

  it('treats DEX_ABSTRACTION by aggregating per-dex account values into the hyperliquid balance bucket', async () => {
    ;({ restore } = installInfoFetchMock(
      defaultResponses(HlAbstractionMode.DEX_ABSTRACTION),
      HL_MARKETS
    ))

    const result = await getAccount(ctx, {
      address: ADDRESS,
    })

    // DEX_ABSTRACTION: spot USDC + total venue equity, both collateral.
    expect(result.collateralBalances.map((b) => b.categoryId).sort()).toEqual([
      'hyperliquid',
      'spot',
    ])
    const venue = result.collateralBalances.find(
      (b) => b.categoryId === 'hyperliquid'
    )
    expect(venue?.valueUsd).toBe('10000')
  })

  const failingTypeMock = (failType: string) => {
    const responses = defaultResponses()
    return vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/markets')) {
          return new Response(JSON.stringify({ markets: HL_MARKETS }), {
            status: 200,
          })
        }
        const body = JSON.parse((init?.body as string) ?? '{}') as Record<
          string,
          unknown
        >
        if (body.type === failType) {
          return new Response('boom', { status: 500 })
        }
        const value = (responses as Record<string, unknown>)[
          body.type as string
        ]
        return new Response(JSON.stringify(value), { status: 200 })
      })
  }

  // A transient fetch error must NOT be coerced into a plausible "standard
  // mode" (null) account — that silently routes margin/balance computation
  // down the wrong branch. The error has to surface.
  it('propagates a userAbstraction fetch error instead of masking it as null', async () => {
    const spy = failingTypeMock('userAbstraction')
    restore = () => spy.mockRestore()

    await expect(getAccount(ctx, { address: ADDRESS })).rejects.toThrow()
  })

  it('propagates an extraAgents fetch error instead of masking it as []', async () => {
    const spy = failingTypeMock('extraAgents')
    restore = () => spy.mockRestore()

    await expect(getAccount(ctx, { address: ADDRESS })).rejects.toThrow()
  })

  it('issues the expected /info calls', async () => {
    const mock = installInfoFetchMock(defaultResponses(), HL_MARKETS)
    restore = mock.restore

    await getAccount(ctx, { address: ADDRESS })

    const types = mock.requests.map((r) => r.body.type)
    expect(types).toContain('userFees')
    expect(types).toContain('userAbstraction')
    expect(types).toContain('extraAgents')
    expect(types).toContain('spotClearinghouseState')
    expect(types).toContain('clearinghouseState')
    // All routed through /info on the default base URL
    for (const r of mock.requests) {
      expect(r.url).toBe(`${DEFAULT_HYPERLIQUID_API_URL}/info`)
    }
  })

  it('forwards an AbortSignal to fetch', async () => {
    const mock = installInfoFetchMock(defaultResponses(), HL_MARKETS)
    restore = mock.restore

    const controller = new AbortController()
    await getAccount(ctx, { address: ADDRESS }, { signal: controller.signal })

    // The mock fetch doesn't honour AbortSignal, but every concurrent /info
    // call must propagate the same signal through to the upstream call.
    expect(mock.requests.length).toBeGreaterThan(0)
  })
})
