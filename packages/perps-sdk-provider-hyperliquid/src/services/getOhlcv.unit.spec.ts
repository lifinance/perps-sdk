import { afterEach, describe, expect, it } from 'vitest'
import {
  HL_CANDLE_SNAPSHOT,
  HL_META_AND_CTXS_MAIN,
  HL_PERP_DEXS_MAIN_ONLY,
  HL_SPOT_META,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getOhlcv } from './getOhlcv.js'

describe('getOhlcv', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('wraps candleSnapshot params under `req` and returns a normalised response', async () => {
    const mock = installInfoFetchMock({
      perpDexs: HL_PERP_DEXS_MAIN_ONLY,
      metaAndAssetCtxs: HL_META_AND_CTXS_MAIN,
      spotMeta: HL_SPOT_META,
      candleSnapshot: HL_CANDLE_SNAPSHOT,
    })
    restore = mock.restore

    const result = await getOhlcv(DEFAULT_HYPERLIQUID_API_URL, {
      symbol: 'BTC',
      interval: '1h',
      startTime: 1704067200000,
      endTime: 1704160000000,
    })

    expect(result.provider).toBe('hyperliquid')
    expect(result.assetId).toBe('BTC')
    expect(result.interval).toBe('1h')
    expect(result.candles).toHaveLength(2)

    const candleReq = mock.requests.find(
      (r) => r.body.type === 'candleSnapshot'
    )!
    expect(candleReq.body.req).toEqual({
      coin: 'BTC',
      interval: '1h',
      startTime: 1704067200000,
      endTime: 1704160000000,
    })
  })

  it('rewrites the @0 wire identifier to PURR/USDC when querying spot', async () => {
    const mock = installInfoFetchMock({
      perpDexs: HL_PERP_DEXS_MAIN_ONLY,
      metaAndAssetCtxs: HL_META_AND_CTXS_MAIN,
      spotMeta: HL_SPOT_META,
      candleSnapshot: HL_CANDLE_SNAPSHOT,
    })
    restore = mock.restore

    await getOhlcv(DEFAULT_HYPERLIQUID_API_URL, {
      symbol: '@0',
      interval: '1h',
      startTime: 1704067200000,
    })

    const candleReq = mock.requests.find(
      (r) => r.body.type === 'candleSnapshot'
    )!
    expect((candleReq.body.req as Record<string, unknown>).coin).toBe(
      'PURR/USDC'
    )
  })

  it('throws MarketNotFound for an unknown perp symbol before issuing candleSnapshot', async () => {
    const mock = installInfoFetchMock({
      perpDexs: HL_PERP_DEXS_MAIN_ONLY,
      metaAndAssetCtxs: HL_META_AND_CTXS_MAIN,
      spotMeta: HL_SPOT_META,
      candleSnapshot: HL_CANDLE_SNAPSHOT,
    })
    restore = mock.restore

    await expect(
      getOhlcv(DEFAULT_HYPERLIQUID_API_URL, {
        symbol: 'DOGE',
        interval: '1h',
      })
    ).rejects.toThrow(/Asset not found/)
    expect(mock.requests.some((r) => r.body.type === 'candleSnapshot')).toBe(
      false
    )
  })
})
