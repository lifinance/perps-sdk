import { afterEach, describe, expect, it } from 'vitest'
import { HL_ASSET_CONTEXT, HL_USER_FILLS } from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getFills } from './getFills.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

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
    const mock = installInfoFetchMock(baseResponses)
    restore = mock.restore

    const result = await getFills(
      DEFAULT_HYPERLIQUID_API_URL,
      { address: ADDRESS },
      HL_ASSET_CONTEXT
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0].asset.displayQuote).toBe('USDC')
    expect(mock.requests.some((r) => r.body.type === 'userFills')).toBe(true)
    expect(mock.requests.some((r) => r.body.type === 'userFillsByTime')).toBe(
      false
    )
  })

  it('switches to `userFillsByTime` when startTime or endTime is provided', async () => {
    const mock = installInfoFetchMock(baseResponses)
    restore = mock.restore

    await getFills(
      DEFAULT_HYPERLIQUID_API_URL,
      { address: ADDRESS, startTime: 1000, endTime: 2000 },
      HL_ASSET_CONTEXT
    )

    const byTime = mock.requests.find((r) => r.body.type === 'userFillsByTime')
    expect(byTime).toBeDefined()
    expect(byTime!.body.startTime).toBe(1000)
    expect(byTime!.body.endTime).toBe(2000)
  })

  it('drops fills at or above the cursor tid', async () => {
    ;({ restore } = installInfoFetchMock(baseResponses))

    const result = await getFills(
      DEFAULT_HYPERLIQUID_API_URL,
      { address: ADDRESS, cursor: '100' },
      HL_ASSET_CONTEXT
    )
    // The only fill has tid 100; cursor is exclusive so it's filtered out.
    expect(result.items).toHaveLength(0)
  })

  it('returns the last item id as the next cursor and reports hasMore against the limit', async () => {
    const manyFills = Array.from({ length: 3 }, (_, i) => ({
      ...HL_USER_FILLS[0],
      tid: 200 + i,
      time: 1704067200000 + i,
    }))
    ;({ restore } = installInfoFetchMock({
      ...baseResponses,
      userFills: manyFills,
    }))

    const result = await getFills(
      DEFAULT_HYPERLIQUID_API_URL,
      { address: ADDRESS, limit: 2 },
      HL_ASSET_CONTEXT
    )

    expect(result.items).toHaveLength(2)
    expect(result.pagination.hasMore).toBe(true)
    expect(result.pagination.cursor).toBe(result.items[1].id)
  })
})
