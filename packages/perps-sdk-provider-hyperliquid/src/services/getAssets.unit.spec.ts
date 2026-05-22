import { afterEach, describe, expect, it } from 'vitest'
import {
  HL_META_AND_CTXS_MAIN,
  HL_PERP_DEXS_MAIN_ONLY,
  HL_SPOT_META,
  HL_SPOT_META_AND_ASSET_CTXS,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getAsset } from './getAsset.js'
import { getAssets } from './getAssets.js'

const responses = {
  perpDexs: HL_PERP_DEXS_MAIN_ONLY,
  metaAndAssetCtxs: HL_META_AND_CTXS_MAIN,
  spotMeta: HL_SPOT_META,
  spotMetaAndAssetCtxs: HL_SPOT_META_AND_ASSET_CTXS,
}

describe('getAssets', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('returns one entry per non-delisted perp universe entry plus one per spot pair', async () => {
    ;({ restore } = installInfoFetchMock(responses))

    const { assets } = await getAssets(DEFAULT_HYPERLIQUID_API_URL)

    // BTC + ETH (DELISTED dropped) + PURR/USDC spot
    expect(assets.map((a) => a.assetId).sort()).toEqual(['@0', 'BTC', 'ETH'])
    const btc = assets.find((a) => a.assetId === 'BTC')!
    expect(btc.market).toBe('hyperliquid')
    expect(btc.displaySymbol).toBe('BTC')
    expect(btc.displayQuote).toBe('USDC')

    const spot = assets.find((a) => a.assetId === '@0')!
    expect(spot.market).toBe('spot')
    expect(spot.displaySymbol).toBe('PURR/USDC')
    expect(spot.markPrice).toBe('0.5')
  })
})

describe('getAsset', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('returns the enriched Asset for a known symbol', async () => {
    ;({ restore } = installInfoFetchMock(responses))

    const asset = await getAsset(DEFAULT_HYPERLIQUID_API_URL, { symbol: 'BTC' })
    expect(asset.assetId).toBe('BTC')
    expect(asset.market).toBe('hyperliquid')
    expect(asset.displayQuote).toBe('USDC')
  })

  it('throws MarketNotFound for an unknown symbol', async () => {
    ;({ restore } = installInfoFetchMock(responses))

    await expect(
      getAsset(DEFAULT_HYPERLIQUID_API_URL, { symbol: 'DOGE' })
    ).rejects.toThrow(/Asset not found/)
  })
})
