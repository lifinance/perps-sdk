import { afterEach, describe, expect, it } from 'vitest'
import {
  HL_ALL_MIDS,
  HL_PERP_DEXS_MAIN_ONLY,
  HL_SPOT_META,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getPrices } from './getPrices.js'

describe('getPrices', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('flattens the upstream allMids record into AssetPrice entries', async () => {
    ;({ restore } = installInfoFetchMock({
      perpDexs: HL_PERP_DEXS_MAIN_ONLY,
      spotMeta: HL_SPOT_META,
      allMids: HL_ALL_MIDS,
    }))

    const { prices } = await getPrices(DEFAULT_HYPERLIQUID_API_URL)
    expect(prices).toEqual([
      { assetId: 'BTC', price: '95000' },
      { assetId: 'ETH', price: '3400' },
    ])
  })

  it('filters by the optional symbols allow-list', async () => {
    ;({ restore } = installInfoFetchMock({
      perpDexs: HL_PERP_DEXS_MAIN_ONLY,
      spotMeta: HL_SPOT_META,
      allMids: HL_ALL_MIDS,
    }))

    const { prices } = await getPrices(DEFAULT_HYPERLIQUID_API_URL, {
      symbols: ['BTC'],
    })
    expect(prices.map((p) => p.assetId)).toEqual(['BTC'])
  })
})
