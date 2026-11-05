import { createPerpsClient } from '@lifi/perps-sdk'
import { FillClassification, LiquidityRole, OrderSide } from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HL_DELISTED_MARKET,
  HL_DELISTED_USER_FILLS,
  HL_MARKETS,
  HL_SPOT_MARKET,
  HL_SPOT_USER_FILLS,
  HL_TWAP_SLICE_FILL_REFERENCE,
  HL_USER_FILLS,
} from '../../test/fixtures.js'
import {
  installInfoFetchMock,
  type RecordedRequest,
} from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import type { HlUserFills } from '../types/index.js'
import { getFills } from './getFills.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})

const baseResponses = {
  userFills: HL_USER_FILLS,
  userFillsByTime: HL_USER_FILLS,
  userTwapSliceFills: [],
  userTwapSliceFillsByTime: [],
}

const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

describe('getFills', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('enriches a spot fill onto the backend BASE/QUOTE display and spot logo', async () => {
    ;({ restore } = installInfoFetchMock(
      { ...baseResponses, userFills: HL_SPOT_USER_FILLS },
      [...HL_MARKETS, HL_SPOT_MARKET]
    ))

    const result = await getFills(ctx, {
      address: ADDRESS,
    })

    expect(result.items[0].market.baseAsset.displaySymbol).toBe('BTC/USDC')
    expect(result.items[0].market.baseAsset.logoURI).toBe(
      'https://app.hyperliquid.xyz/coins/BTC_spot.svg'
    )
  })

  it('maps fills for a known delisted market', async () => {
    ;({ restore } = installInfoFetchMock(
      { ...baseResponses, userFills: HL_DELISTED_USER_FILLS },
      [...HL_MARKETS, HL_DELISTED_MARKET]
    ))

    const result = await getFills(ctx, {
      address: ADDRESS,
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].market.id).toBe('DELISTED')
    expect(result.items[0].market.isDelisted).toBe(true)
  })

  it('skips an outcome market fill', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        userFills: [
          ...HL_USER_FILLS,
          { ...HL_USER_FILLS[0], tid: 101, coin: '#26140' },
        ],
      },
      HL_MARKETS
    ))

    const result = await getFills(ctx, {
      address: ADDRESS,
    })

    expect(result.items.map((item) => item.market.id)).toEqual(['BTC'])
  })

  it('paginates completely without duplicates or gaps when the upstream response is ascending-time with non-monotonic tids', async () => {
    // Ascending time order with a tid that dips mid-sequence — HL's docs
    // guarantee neither newest-first ordering nor monotonic tid.
    const unsortedFills = [
      { ...HL_USER_FILLS[0], tid: 100, time: 1000 },
      { ...HL_USER_FILLS[0], tid: 300, time: 2000 },
      { ...HL_USER_FILLS[0], tid: 200, time: 3000 },
      { ...HL_USER_FILLS[0], tid: 400, time: 4000 },
    ]
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        userFills: unsortedFills,
        userFillsByTime: unsortedFills,
      },
      HL_MARKETS
    ))

    const page1 = await getFills(ctx, { address: ADDRESS, limit: 2 })
    expect(page1.items.map((i) => i.id)).toEqual(['400', '200'])
    expect(page1.pagination.hasMore).toBe(true)

    const page2 = await getFills(ctx, {
      address: ADDRESS,
      limit: 2,
      cursor: page1.pagination.cursor,
    })
    expect(page2.items.map((i) => i.id)).toEqual(['300', '100'])
    expect(page2.pagination.hasMore).toBe(false)

    const seenIds = [...page1.items, ...page2.items].map((i) => i.id)
    expect(new Set(seenIds).size).toBe(4)
  })

  it('returns a TWAP slice fill that the regular feed omits', async () => {
    ;({ restore } = installInfoFetchMock(
      { ...baseResponses, userTwapSliceFills: [HL_TWAP_SLICE_FILL_REFERENCE] },
      HL_MARKETS
    ))

    const result = await getFills(ctx, { address: ADDRESS })

    expect(result.items.map((item) => item.id)).toEqual([
      '648473049019291',
      '100',
    ])
    const [twapFill] = result.items
    expect(twapFill).toMatchObject({
      id: '648473049019291',
      orderId: '590716607007',
      market: { id: 'ETH' },
      side: OrderSide.SELL,
      size: '0.0161',
      price: '3101.5',
      fee: { amount: '0.022455', asset: 'USDC' },
      realizedPnl: '1.288',
      liquidity: LiquidityRole.TAKER,
      classification: FillClassification.REDUCED_LONG,
      createdAt: '2026-10-29T18:55:20.247Z',
    })
    expect(twapFill.explorerLink).toBeUndefined()
  })

  it('reads both time-bounded feeds with the requested bounds', async () => {
    let requests: RecordedRequest[]
    ;({ restore, requests } = installInfoFetchMock(
      {
        ...baseResponses,
        userTwapSliceFillsByTime: [HL_TWAP_SLICE_FILL_REFERENCE],
      },
      HL_MARKETS
    ))

    const result = await getFills(ctx, {
      address: ADDRESS,
      startTime: 1_793_286_644_010,
      endTime: 1_793_368_005_021,
    })

    expect(result.items.map((item) => item.id)).toEqual(['648473049019291'])
    expect(requests.map(({ body }) => body)).toEqual(
      expect.arrayContaining([
        {
          type: 'userFillsByTime',
          user: ADDRESS,
          startTime: 1_793_286_644_010,
          endTime: 1_793_368_005_021,
        },
        {
          type: 'userTwapSliceFillsByTime',
          user: ADDRESS,
          startTime: 1_793_286_644_010,
          endTime: 1_793_368_005_021,
        },
      ])
    )
    expect(
      requests.some(({ body }) => body.type === 'userTwapSliceFills')
    ).toBe(false)
  })

  it('returns one execution when both feeds carry the same trade ID', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        userTwapSliceFills: [{ twapId: 1, fill: HL_USER_FILLS[0] }],
      },
      HL_MARKETS
    ))

    const result = await getFills(ctx, { address: ADDRESS })

    expect(result.items.map((item) => item.id)).toEqual(['100'])
  })

  it('rejects when the TWAP slice fill request fails', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        userTwapSliceFills: new Response('{}', { status: 503 }),
      },
      HL_MARKETS
    ))

    await expect(getFills(ctx, { address: ADDRESS })).rejects.toMatchObject({
      tool: 'hyperliquid',
    })
  })
})

describe('getFills — unresolvable market rows', () => {
  // The market registry is cached per client and warns once per unresolved id,
  // so every test needs its own client to see its own warning.
  let unresolvedCtx: {
    client: ReturnType<typeof createPerpsClient>
    apiUrl: string
  }
  let restore: () => void

  beforeEach(() => {
    unresolvedCtx = {
      client: createPerpsClient({
        integrator: 'test',
        apiKey: 'k',
        retry: false,
      }),
      apiUrl: DEFAULT_HYPERLIQUID_API_URL,
    }
  })

  afterEach(() => {
    restore?.()
  })

  const UNKNOWN_COIN = 'GHOST'

  const unknownFill = (
    overrides: Partial<HlUserFills[number]> = {}
  ): HlUserFills[number] => ({
    ...HL_USER_FILLS[0],
    tid: 900,
    time: 1704067100000,
    coin: UNKNOWN_COIN,
    ...overrides,
  })

  it('drops a fill row whose coin the registry cannot resolve', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;({ restore } = installInfoFetchMock(
      { ...baseResponses, userFills: [unknownFill(), ...HL_USER_FILLS] },
      HL_MARKETS
    ))

    const result = await getFills(unresolvedCtx, { address: ADDRESS })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ id: '100', market: { id: 'BTC' } })
    expect(warn).toHaveBeenCalledWith(
      `[hyperliquid] unknown market id '${UNKNOWN_COIN}'`
    )
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('keeps a fill row on a delisted market while dropping an unresolvable one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        userFills: [unknownFill(), ...HL_DELISTED_USER_FILLS],
      },
      [...HL_MARKETS, HL_DELISTED_MARKET]
    ))

    const result = await getFills(unresolvedCtx, { address: ADDRESS })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].market).toMatchObject({
      id: 'DELISTED',
      isDelisted: true,
    })
    warn.mockRestore()
  })

  it('propagates a failed fills fetch instead of returning an empty page', async () => {
    ;({ restore } = installInfoFetchMock({}, HL_MARKETS))

    await expect(
      getFills(unresolvedCtx, { address: ADDRESS })
    ).rejects.toThrow()
  })
})
