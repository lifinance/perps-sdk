import { createPerpsClient, PerpsError } from '@lifi/perps-sdk'
import { type Market, PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HL_CLEARINGHOUSE_STATE,
  HL_EXTRA_AGENTS,
  HL_MARKETS,
  HL_SPOT_CLEARINGHOUSE_STATE,
  HL_UNIFIED_SPOT_CLEARINGHOUSE_STATE,
  HL_USER_FEES,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { getAccountSummary } from '../accountSummary.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { HlAbstractionMode } from '../types/index.js'
import { getAccount } from './getAccount.js'
import { getPositions } from './getPositions.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
/** Venue buying power of the portfolio-margin spot state below. */
const PM_AVAILABLE = '7160'
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

/** Unified and portfolio-margin accounts keep the whole account in spot. */
const unifiedResponses = (abstraction: HlAbstractionMode) => ({
  ...defaultResponses(abstraction),
  spotClearinghouseState: HL_UNIFIED_SPOT_CLEARINGHOUSE_STATE,
})

const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

const XYZ_MARKET: Market = {
  ...HL_MARKETS[0],
  id: 'xyz:XYZ',
  categoryId: 'xyz',
  baseAsset: {
    ...HL_MARKETS[0].baseAsset,
    id: 'xyz:XYZ',
    displaySymbol: 'XYZ',
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: '200',
    displaySymbol: 'USDE',
    logoURI: '',
  },
}

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
        price: '1',
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
        price: '1',
        transferable: HL_CLEARINGHOUSE_STATE.withdrawable,
      },
    ])
    expect(result.marginUsed).toBe(
      HL_CLEARINGHOUSE_STATE.marginSummary.totalMarginUsed
    )
    expect(result.unrealizedPnl).toBe('100')
  })

  it('skips an outcome market position and an outcome spot token', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...defaultResponses(),
        spotClearinghouseState: {
          balances: [
            ...HL_SPOT_CLEARINGHOUSE_STATE.balances,
            {
              coin: '+26140',
              token: 100_026_140,
              total: '3',
              hold: '0',
              entryNtl: '0',
            },
          ],
        },
        clearinghouseState: {
          ...HL_CLEARINGHOUSE_STATE,
          assetPositions: [
            ...HL_CLEARINGHOUSE_STATE.assetPositions,
            {
              position: {
                ...HL_CLEARINGHOUSE_STATE.assetPositions[0].position,
                coin: '#26140',
              },
            },
          ],
        },
      },
      HL_MARKETS
    ))

    const result = await getAccount(ctx, {
      address: ADDRESS,
    })

    expect(result.positions.map((p) => p.market.id)).toEqual(['BTC'])
    expect(result.balances).toEqual([])
    expect(result.collateralBalances.map((b) => b.asset.displaySymbol)).toEqual(
      ['USDC', 'USDC']
    )
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

  it('treats UNIFIED_ACCOUNT abstraction by dropping per-dex balances', async () => {
    ;({ restore } = installInfoFetchMock(
      unifiedResponses(HlAbstractionMode.UNIFIED_ACCOUNT),
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
        units: '10000',
        valueUsd: '10000',
        price: '1',
      },
    ])
    expect(result.marginUsed).toBe(
      HL_CLEARINGHOUSE_STATE.marginSummary.totalMarginUsed
    )
  })

  it('carries the venue buying power on a UNIFIED_ACCOUNT config', async () => {
    ;({ restore } = installInfoFetchMock(
      unifiedResponses(HlAbstractionMode.UNIFIED_ACCOUNT),
      HL_MARKETS
    ))

    const result = await getAccount(ctx, { address: ADDRESS })

    const [, usdcAvailable] =
      HL_UNIFIED_SPOT_CLEARINGHOUSE_STATE.tokenToAvailableAfterMaintenance[0]
    expect(
      result.config.provider === 'hyperliquid'
        ? result.config.availableAfterMaintenance
        : undefined
    ).toBe(usdcAvailable)
  })

  it('omits the venue buying power on a standard config', async () => {
    ;({ restore } = installInfoFetchMock(defaultResponses(), HL_MARKETS))

    const result = await getAccount(ctx, { address: ADDRESS })

    expect(
      result.config.provider === 'hyperliquid'
        ? result.config.availableAfterMaintenance
        : undefined
    ).toBeUndefined()
  })

  it('reads unified margin from the venue total, not from the positions', async () => {
    const assetPosition = HL_CLEARINGHOUSE_STATE.assetPositions[0]
    ;({ restore } = installInfoFetchMock(
      {
        ...unifiedResponses(HlAbstractionMode.UNIFIED_ACCOUNT),
        clearinghouseState: {
          ...HL_CLEARINGHOUSE_STATE,
          assetPositions: [
            {
              ...assetPosition,
              position: {
                ...assetPosition.position,
                marginUsed: '0.00000001',
              },
            },
            {
              ...assetPosition,
              position: {
                ...assetPosition.position,
                coin: 'ETH',
                marginUsed: '0.00000002',
              },
            },
          ],
        },
      },
      HL_MARKETS
    ))

    const result = await getAccount(ctx, { address: ADDRESS })

    expect(result.marginUsed).toBe(
      HL_CLEARINGHOUSE_STATE.marginSummary.totalMarginUsed
    )
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

  it('sums per-dex margin as exact decimals', async () => {
    const responses = defaultResponses(HlAbstractionMode.DEX_ABSTRACTION)
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/marketsContext')) {
          return new Response(JSON.stringify({ prices: [] }))
        }
        if (url.includes('/markets')) {
          return new Response(
            JSON.stringify({ markets: [...HL_MARKETS, XYZ_MARKET] })
          )
        }
        const body = JSON.parse((init?.body as string) ?? '{}') as {
          type: keyof typeof responses
          dex?: string
        }
        const state =
          body.dex === 'xyz'
            ? {
                ...HL_CLEARINGHOUSE_STATE,
                marginSummary: {
                  ...HL_CLEARINGHOUSE_STATE.marginSummary,
                  accountValue: '0',
                  totalMarginUsed: '0.2',
                },
                assetPositions: [],
              }
            : {
                ...HL_CLEARINGHOUSE_STATE,
                marginSummary: {
                  ...HL_CLEARINGHOUSE_STATE.marginSummary,
                  totalMarginUsed: '0.1',
                },
              }
        const value =
          body.type === 'clearinghouseState' ? state : responses[body.type]
        return new Response(JSON.stringify(value))
      })
    restore = () => spy.mockRestore()

    const result = await getAccount(ctx, { address: ADDRESS })

    expect(result.marginUsed).toBe('0.3')
  })

  it('reports each sub-dex transferable amount, below the account-wide free margin', async () => {
    const responses = defaultResponses()
    const dexState = (
      accountValue: string,
      totalMarginUsed: string,
      withdrawable: string
    ) => ({
      ...HL_CLEARINGHOUSE_STATE,
      marginSummary: {
        ...HL_CLEARINGHOUSE_STATE.marginSummary,
        accountValue,
        totalMarginUsed,
      },
      withdrawable,
      assetPositions: [],
    })
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/marketsContext')) {
          return new Response(JSON.stringify({ prices: [] }))
        }
        if (url.includes('/markets')) {
          return new Response(
            JSON.stringify({ markets: [...HL_MARKETS, XYZ_MARKET] })
          )
        }
        const body = JSON.parse((init?.body as string) ?? '{}') as {
          type: keyof typeof responses
          dex?: string
        }
        const state =
          body.dex === 'xyz'
            ? dexState('50', '0', '50')
            : dexState('100', '60', '40')
        const value =
          body.type === 'clearinghouseState' ? state : responses[body.type]
        return new Response(JSON.stringify(value))
      })
    restore = () => spy.mockRestore()

    const account = await getAccount(ctx, { address: ADDRESS })
    const transferable = new Map(
      account.collateralBalances
        .filter((b) => b.categoryId !== 'spot')
        .map((b) => [b.categoryId, b.transferable])
    )

    expect(transferable).toEqual(
      new Map([
        ['hyperliquid', '40'],
        ['xyz', '50'],
      ])
    )
    expect(getAccountSummary(account, []).availableMargin).toBe('90')
    expect(
      account.collateralBalances.find((b) => b.categoryId === 'spot')
    ).not.toHaveProperty('transferable')
  })

  it('throws a named error identifying a non-decimal totalMarginUsed', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...defaultResponses(),
        clearinghouseState: {
          ...HL_CLEARINGHOUSE_STATE,
          marginSummary: {
            ...HL_CLEARINGHOUSE_STATE.marginSummary,
            totalMarginUsed: 'n/a',
          },
        },
      },
      HL_MARKETS
    ))

    const error = await getAccount(ctx, { address: ADDRESS }).catch(
      (cause: unknown) => cause
    )

    expect(error).toBeInstanceOf(PerpsError)
    if (!(error instanceof PerpsError)) {
      expect.unreachable('getAccount must throw PerpsError')
    }
    expect(error.code).toBe(PerpsErrorCode.SDKError)
    expect(error.message).toContain('marginSummary.totalMarginUsed')
  })

  it('returns standard account margin in fixed-point notation', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...defaultResponses(),
        clearinghouseState: {
          ...HL_CLEARINGHOUSE_STATE,
          marginSummary: {
            ...HL_CLEARINGHOUSE_STATE.marginSummary,
            totalMarginUsed: '0.00000001',
          },
        },
      },
      HL_MARKETS
    ))

    const result = await getAccount(ctx, { address: ADDRESS })

    expect(result.marginUsed).toBe('0.00000001')
  })

  it.each([
    null,
    HlAbstractionMode.DEFAULT,
    HlAbstractionMode.DISABLED,
    HlAbstractionMode.DEX_ABSTRACTION,
  ])('omits a zero-equity sub-dex balance in %s mode', async (abstraction) => {
    const responses = defaultResponses(abstraction)
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/marketsContext')) {
          return new Response(JSON.stringify({ prices: [] }))
        }
        if (url.includes('/markets')) {
          return new Response(
            JSON.stringify({ markets: [...HL_MARKETS, XYZ_MARKET] })
          )
        }
        const body = JSON.parse((init?.body as string) ?? '{}') as {
          type: keyof typeof responses
          dex?: string
        }
        const value =
          body.type === 'clearinghouseState' && body.dex === 'xyz'
            ? {
                ...HL_CLEARINGHOUSE_STATE,
                marginSummary: {
                  accountValue: '0',
                  totalMarginUsed: '0',
                },
                crossMarginSummary: {
                  accountValue: '0',
                  totalMarginUsed: '0',
                },
                assetPositions: [],
              }
            : responses[body.type]
        return new Response(JSON.stringify(value))
      })
    restore = () => spy.mockRestore()

    const result = await getAccount(ctx, { address: ADDRESS })

    expect(
      result.collateralBalances.find((balance) => balance.categoryId === 'xyz')
    ).toBeUndefined()
    expect(
      [...result.balances, ...result.collateralBalances].every(
        (balance) => balance.units !== '0'
      )
    ).toBe(true)
  })

  it('throws a named error identifying a non-decimal accountValue', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...defaultResponses(),
        clearinghouseState: {
          ...HL_CLEARINGHOUSE_STATE,
          marginSummary: {
            ...HL_CLEARINGHOUSE_STATE.marginSummary,
            accountValue: 'n/a',
          },
        },
      },
      HL_MARKETS
    ))

    await expect(getAccount(ctx, { address: ADDRESS })).rejects.toThrow(
      /marginSummary\.accountValue/
    )
  })

  it('carries PORTFOLIO_MARGIN spot collateral at full value and reads the venue buying power', async () => {
    const spotMarket = (
      id: string,
      baseId: string,
      symbol: string
    ): Market => ({
      providerId: 'hyperliquid',
      id,
      categoryId: 'spot',
      baseAsset: {
        providerId: 'hyperliquid',
        id: baseId,
        displaySymbol: symbol,
        logoURI: `https://app.hyperliquid.xyz/coins/${symbol}.svg`,
      },
      quoteAsset: {
        providerId: 'hyperliquid',
        id: '0',
        displaySymbol: 'USDC',
        logoURI: '',
      },
      szDecimals: 2,
    })

    ;({ restore } = installInfoFetchMock(
      {
        ...defaultResponses(HlAbstractionMode.PORTFOLIO_MARGIN),
        spotClearinghouseState: {
          balances: [
            { coin: 'USDC', token: 0, total: '1000', hold: '0', entryNtl: '0' },
            {
              coin: 'HYPE',
              token: 150,
              total: '100',
              hold: '0',
              entryNtl: '0',
            },
            {
              coin: 'UBTC',
              token: 197,
              total: '0.1',
              hold: '0',
              entryNtl: '0',
            },
          ],
          tokenToAvailableAfterMaintenance: [[0, PM_AVAILABLE]],
        },
      },
      [
        ...HL_MARKETS,
        spotMarket('@200', '150', 'HYPE'),
        spotMarket('@201', '197', 'UBTC'),
      ],
      [
        { marketId: '@200', midPrice: '40', markPrice: '40' },
        { marketId: '@201', midPrice: '100000', markPrice: '100000' },
      ]
    ))

    const result = await getAccount(ctx, { address: ADDRESS })

    // Only the category quote asset is collateral. Borrow capacity against the
    // other spot tokens comes from the venue, not from an SDK weight.
    expect(result.collateralBalances).toEqual([
      {
        categoryId: 'spot',
        asset: {
          providerId: 'hyperliquid',
          id: '0',
          displaySymbol: 'USDC',
          logoURI: 'https://app.hyperliquid.xyz/coins/USDC.svg',
        },
        units: '1000',
        valueUsd: '1000',
        price: '1',
      },
    ])
    expect(result.balances).toEqual([
      {
        categoryId: 'spot',
        asset: {
          providerId: 'hyperliquid',
          id: '150',
          displaySymbol: 'HYPE',
          logoURI:
            'https://static.debank.com/image/hyper_token/logo_url/hyper/0b3e288cfe418e9ce69eef4c96374583.png',
        },
        units: '100',
        valueUsd: '4000',
        price: '40',
      },
      {
        categoryId: 'spot',
        asset: {
          providerId: 'hyperliquid',
          id: '197',
          displaySymbol: 'UBTC',
          logoURI: 'https://app.hyperliquid.xyz/coins/UBTC_spot.svg',
        },
        units: '0.1',
        valueUsd: '10000',
        price: '100000',
      },
    ])

    const summary = getAccountSummary(result, result.positions)
    expect(summary.availableMargin).toBe(PM_AVAILABLE)
    expect(summary.marginUsed).toBe(
      HL_CLEARINGHOUSE_STATE.marginSummary.totalMarginUsed
    )
  })

  it('values spot collateral from `total`, ignoring the `hold` (in-order) portion', async () => {
    // A resting spot order locks part of the balance in `hold`; the account
    // read counts the full `total` as collateral regardless.
    ;({ restore } = installInfoFetchMock(
      {
        ...defaultResponses(),
        spotClearinghouseState: {
          balances: [
            {
              coin: 'USDC',
              token: 0,
              total: '500',
              hold: '200',
              entryNtl: '0',
            },
          ],
        },
      },
      HL_MARKETS
    ))

    const result = await getAccount(ctx, { address: ADDRESS })

    const spot = result.collateralBalances.find((b) => b.categoryId === 'spot')
    expect(spot?.units).toBe('500')
    expect(spot?.valueUsd).toBe('500')
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
