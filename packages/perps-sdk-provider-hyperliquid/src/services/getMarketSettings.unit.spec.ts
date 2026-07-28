import { createPerpsClient } from '@lifi/perps-sdk'
import { MarginMode } from '@lifi/perps-types'
import { afterEach, describe, expect, it } from 'vitest'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import {
  DEFAULT_HYPERLIQUID_API_URL,
  MAIN_MARKET_ID,
  SPOT_MARKET_ID,
} from '../constants.js'
import { getMarketSettings } from './getMarketSettings.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})
const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

describe('getMarketSettings', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('maps the venue-stored cross leverage from activeAssetData', async () => {
    let requests: ReturnType<typeof installInfoFetchMock>['requests']
    // Live capture: the venue answers for any coin, position or not.
    ;({ restore, requests } = installInfoFetchMock({
      activeAssetData: {
        user: ADDRESS.toLowerCase(),
        coin: 'BTC',
        leverage: { type: 'cross', value: 20 },
        maxTradeSzs: ['0.0003', '0.0003'],
        availableToTrade: ['1.000881', '1.000881'],
        markPx: '64996.0',
      },
    }))

    await expect(
      getMarketSettings(ctx, {
        address: ADDRESS,
        market: { marketId: 'BTC', categoryId: MAIN_MARKET_ID },
      })
    ).resolves.toEqual({ marginMode: MarginMode.CROSS, leverage: 20 })
    expect(requests).toHaveLength(1)
    expect(requests[0].body).toEqual({
      type: 'activeAssetData',
      user: ADDRESS,
      coin: 'BTC',
    })
  })

  it('maps an isolated setting', async () => {
    ;({ restore } = installInfoFetchMock({
      activeAssetData: {
        user: ADDRESS.toLowerCase(),
        coin: 'ETH',
        leverage: { type: 'isolated', value: 3 },
        maxTradeSzs: ['1', '1'],
        availableToTrade: ['10', '10'],
        markPx: '2000.0',
      },
    }))

    await expect(
      getMarketSettings(ctx, {
        address: ADDRESS,
        market: { marketId: 'ETH', categoryId: MAIN_MARKET_ID },
      })
    ).resolves.toEqual({ marginMode: MarginMode.ISOLATED, leverage: 3 })
  })

  it('resolves undefined for spot markets without a request', async () => {
    let requests: ReturnType<typeof installInfoFetchMock>['requests']
    ;({ restore, requests } = installInfoFetchMock({}))

    await expect(
      getMarketSettings(ctx, {
        address: ADDRESS,
        market: { marketId: '@142', categoryId: SPOT_MARKET_ID },
      })
    ).resolves.toBeUndefined()
    await expect(
      getMarketSettings(ctx, {
        address: ADDRESS,
        market: { marketId: 'PURR/USDC', categoryId: SPOT_MARKET_ID },
      })
    ).resolves.toBeUndefined()
    expect(requests).toHaveLength(0)
  })
})
