import { createPerpsClient } from '@lifi/perps-sdk'
import { afterEach, describe, expect, it } from 'vitest'
import {
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

describe('getFills', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('uses `userFills` when neither startTime nor endTime is provided', async () => {
    const mock = installInfoFetchMock(baseResponses, HL_MARKETS)
    restore = mock.restore

    const result = await getFills(client, DEFAULT_HYPERLIQUID_API_URL, {
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

    await getFills(client, DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
      startTime: 1000,
      endTime: 2000,
    })

    const byTime = mock.requests.find((r) => r.body.type === 'userFillsByTime')
    expect(byTime).toBeDefined()
    expect(byTime!.body.startTime).toBe(1000)
    expect(byTime!.body.endTime).toBe(2000)
  })

  it('drops fills at or above the cursor tid', async () => {
    ;({ restore } = installInfoFetchMock(baseResponses, HL_MARKETS))

    const result = await getFills(client, DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
      cursor: '100',
    })
    // The only fill has tid 100; cursor is exclusive so it's filtered out.
    expect(result.items).toHaveLength(0)
  })

  it('enriches a spot fill onto the backend BASE/QUOTE display and spot logo', async () => {
    ;({ restore } = installInfoFetchMock(
      { ...baseResponses, userFills: HL_SPOT_USER_FILLS },
      [...HL_MARKETS, HL_SPOT_MARKET]
    ))

    const result = await getFills(client, DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
    })

    expect(result.items[0].market.baseAsset.displaySymbol).toBe('BTC/USDC')
    expect(result.items[0].market.baseAsset.logoURI).toBe(
      'https://app.hyperliquid.xyz/coins/BTC_spot.svg'
    )
  })

  it('falls back to the synthesised display for a fill on an unlisted market', async () => {
    ;({ restore } = installInfoFetchMock(
      { ...baseResponses, userFills: HL_SPOT_USER_FILLS },
      HL_MARKETS
    ))

    const result = await getFills(client, DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
    })

    expect(result.items[0].market.id).toBe('@142')
    expect(result.items[0].market.baseAsset.displaySymbol).toBe('@142')
  })

  it('returns the last item id as the next cursor and reports hasMore against the limit', async () => {
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

    const result = await getFills(client, DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
      limit: 2,
    })

    expect(result.items).toHaveLength(2)
    expect(result.pagination.hasMore).toBe(true)
    expect(result.pagination.cursor).toBe(result.items[1].id)
  })
})
