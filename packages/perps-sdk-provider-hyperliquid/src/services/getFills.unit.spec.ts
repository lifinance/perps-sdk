import { createPerpsClient, PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HL_DELISTED_MARKET,
  HL_DELISTED_USER_FILLS,
  HL_MARKETS,
  HL_SPOT_MARKET,
  HL_SPOT_USER_FILLS,
  HL_USER_FILLS,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
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
}

const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

describe('getFills', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('uses `userFills` when neither startTime nor endTime is provided', async () => {
    const mock = installInfoFetchMock(baseResponses, HL_MARKETS)
    restore = mock.restore

    const result = await getFills(ctx, {
      address: ADDRESS,
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].market.quoteAsset.displaySymbol).toBe('USDC')
    expect(mock.requests.some((r) => r.body.type === 'userFills')).toBe(true)
    expect(mock.requests.some((r) => r.body.type === 'userFillsByTime')).toBe(
      false
    )
  })

  it('switches to `userFillsByTime` when startTime or endTime is provided', async () => {
    const mock = installInfoFetchMock(baseResponses, HL_MARKETS)
    restore = mock.restore

    await getFills(ctx, {
      address: ADDRESS,
      startTime: 1000,
      endTime: 2000,
    })

    const byTime = mock.requests.find((r) => r.body.type === 'userFillsByTime')
    expect(byTime).toBeDefined()
    expect(byTime!.body.startTime).toBe(1000)
    expect(byTime!.body.endTime).toBe(2000)
  })

  it('drops fills at or above the composite cursor', async () => {
    ;({ restore } = installInfoFetchMock(baseResponses, HL_MARKETS))

    const result = await getFills(ctx, {
      address: ADDRESS,
      // The only fill has (time 1704067200000, tid 100); the cursor is
      // exclusive so a cursor pointing at it filters it out.
      cursor: '1704067200000:100',
    })
    expect(result.items).toHaveLength(0)
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

  it('throws MarketNotFound for a fill on a market absent from /markets', async () => {
    ;({ restore } = installInfoFetchMock(
      { ...baseResponses, userFills: HL_SPOT_USER_FILLS },
      HL_MARKETS
    ))

    const err = await getFills(ctx, {
      address: ADDRESS,
    }).catch((e) => e)

    expect(err).toBeInstanceOf(PerpsError)
    expect((err as PerpsError).code).toBe(PerpsErrorCode.MarketNotFound)
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
      { ...baseResponses, userFills: unsortedFills },
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

  it('returns the last item composite (time, tid) as the next cursor and reports hasMore against the limit', async () => {
    const manyFills = Array.from({ length: 3 }, (_, i) => ({
      ...HL_USER_FILLS[0],
      tid: 200 + i,
      time: 1704067200000 + i,
    }))
    ;({ restore } = installInfoFetchMock(
      {
        ...baseResponses,
        userFills: manyFills,
      },
      HL_MARKETS
    ))

    const result = await getFills(ctx, {
      address: ADDRESS,
      limit: 2,
    })

    expect(result.items).toHaveLength(2)
    expect(result.pagination.hasMore).toBe(true)
    expect(result.pagination.cursor).toBe('1704067200001:201')
  })
})
