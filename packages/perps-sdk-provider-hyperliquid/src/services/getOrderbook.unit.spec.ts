import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it } from 'vitest'
import { HL_L2_BOOK } from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getOrderbook } from './getOrderbook.js'

describe('getOrderbook', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('normalises bid/ask levels and respects the depth parameter', async () => {
    ;({ restore } = installInfoFetchMock({ l2Book: HL_L2_BOOK }))

    const result = await getOrderbook(DEFAULT_HYPERLIQUID_API_URL, {
      symbol: 'BTC',
      depth: 1,
    })

    expect(result.provider).toBe('hyperliquid')
    expect(result.assetId).toBe('BTC')
    expect(result.bids).toEqual([{ price: '94999', size: '1.5' }])
    expect(result.asks).toEqual([{ price: '95001', size: '1' }])
    expect(result.timestamp).toBe(1704067200000)
  })

  it('throws MarketNotFound when the venue returns null', async () => {
    ;({ restore } = installInfoFetchMock({ l2Book: null }))

    await expect(
      getOrderbook(DEFAULT_HYPERLIQUID_API_URL, { symbol: 'GHOST' })
    ).rejects.toMatchObject({ code: PerpsErrorCode.MarketNotFound })
  })
})
