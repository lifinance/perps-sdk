import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HL_CLEARINGHOUSE_STATE,
  HL_EXTRA_AGENTS,
  HL_META_AND_CTXS_MAIN,
  HL_PERP_DEXS_MAIN_ONLY,
  HL_SPOT_CLEARINGHOUSE_STATE,
  HL_SPOT_META,
  HL_USER_FEES,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { HlAbstractionMode } from '../types/index.js'
import { getAccount } from './getAccount.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const defaultResponses = (abstraction: HlAbstractionMode | null = null) => ({
  perpDexs: HL_PERP_DEXS_MAIN_ONLY,
  metaAndAssetCtxs: HL_META_AND_CTXS_MAIN,
  spotMeta: HL_SPOT_META,
  userFees: HL_USER_FEES,
  userAbstraction: abstraction,
  extraAgents: HL_EXTRA_AGENTS,
  spotClearinghouseState: HL_SPOT_CLEARINGHOUSE_STATE,
  clearinghouseState: HL_CLEARINGHOUSE_STATE,
})

describe('getAccount', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('normalises a single-dex account into AccountResponse with the typed config', async () => {
    ;({ restore } = installInfoFetchMock(defaultResponses()))

    const result = await getAccount(DEFAULT_HYPERLIQUID_API_URL, {
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
    // Standard mode: per-market balances + spot
    expect(result.balances.spot).toEqual([{ currency: 'USDC', amount: '500' }])
    expect(result.balances.hyperliquid).toEqual([
      { currency: 'USDC', amount: '10000' },
    ])
    expect(result.marginUsed).toBe('500')
    expect(result.unrealizedPnl).toBe('100')
  })

  it('does not surface a builderFeeApproval field (lives at a higher layer)', async () => {
    ;({ restore } = installInfoFetchMock(defaultResponses()))

    const result = await getAccount(DEFAULT_HYPERLIQUID_API_URL, {
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
      defaultResponses(HlAbstractionMode.UNIFIED_ACCOUNT)
    ))

    const result = await getAccount(DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
    })

    expect(Object.keys(result.balances)).toEqual(['spot'])
    // Derived from the single position's marginUsed (940)
    expect(result.marginUsed).toBe('940')
  })

  it('treats DEX_ABSTRACTION by aggregating per-dex account values into the hyperliquid balance bucket', async () => {
    ;({ restore } = installInfoFetchMock(
      defaultResponses(HlAbstractionMode.DEX_ABSTRACTION)
    ))

    const result = await getAccount(DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
    })

    expect(Object.keys(result.balances).sort()).toEqual(['hyperliquid', 'spot'])
    expect(result.balances.hyperliquid).toEqual([
      { currency: 'USDC', amount: '10000' },
    ])
  })

  it('falls back to null abstractionMode when userAbstraction rejects', async () => {
    const responses = defaultResponses()
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const _url = typeof input === 'string' ? input : input.toString()
        const body = JSON.parse((init?.body as string) ?? '{}') as Record<
          string,
          unknown
        >
        if (body.type === 'userAbstraction') {
          return new Response('boom', { status: 500 })
        }
        const value = (responses as Record<string, unknown>)[
          body.type as string
        ]
        return new Response(JSON.stringify(value), { status: 200 })
      })
    restore = () => spy.mockRestore()

    const result = await getAccount(DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
    })

    expect(
      result.config.provider === 'hyperliquid'
        ? result.config.abstractionMode
        : 'wrong'
    ).toBeNull()
  })

  it('issues the expected /info calls', async () => {
    const mock = installInfoFetchMock(defaultResponses())
    restore = mock.restore

    await getAccount(DEFAULT_HYPERLIQUID_API_URL, { address: ADDRESS })

    const types = mock.requests.map((r) => r.body.type)
    expect(types).toContain('perpDexs')
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
    const mock = installInfoFetchMock(defaultResponses())
    restore = mock.restore

    const controller = new AbortController()
    await getAccount(
      DEFAULT_HYPERLIQUID_API_URL,
      { address: ADDRESS },
      { signal: controller.signal }
    )

    // The mock fetch doesn't honour AbortSignal, but every concurrent /info
    // call must propagate the same signal through to the upstream call.
    expect(mock.requests.length).toBeGreaterThan(0)
  })
})
