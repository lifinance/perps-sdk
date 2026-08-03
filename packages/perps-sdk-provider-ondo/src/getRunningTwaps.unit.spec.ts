import { createMemoryStorage, createPerpsClient } from '@lifi/perps-sdk'
import {
  type Market,
  OrderSide,
  PositionMarginAdjustment,
  TwapOrderStatus,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { OndoTokenStore } from './auth/OndoTokenStore.js'
import { ondoProvider } from './OndoProvider.js'
import type { OndoAuthToken } from './types/auth.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const API_URL = 'https://ondo.test'
const MARKET: Market = {
  providerId: 'ondo',
  id: 'TSLA-USD',
  categoryId: 'ondo',
  baseAsset: {
    providerId: 'ondo',
    id: 'TSLA',
    displaySymbol: 'TSLA',
    logoURI: '',
    name: 'Tesla',
    decimals: 18,
  },
  quoteAsset: {
    providerId: 'ondo',
    id: 'USD',
    displaySymbol: 'USD',
    logoURI: '',
    name: 'US Dollar',
    decimals: 6,
  },
  szDecimals: 3,
  priceDecimals: 2,
  maxLeverage: 20,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.NONE,
}
const TOKEN: OndoAuthToken = {
  identifier: ADDRESS,
  authType: 'siwe',
  accountId: 'account-1',
  issuedAtSecs: Math.floor(Date.now() / 1000) - 60,
  expirationSecs: Math.floor(Date.now() / 1000) + 3600,
  token: 'session-jwt',
}

describe('Ondo getRunningTwaps', () => {
  it('uses the session-authenticated running-TWAP endpoint and maps venue fields', async () => {
    let twapUrl: string | undefined
    let authorization: string | null | undefined
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.includes('/markets')) {
        return Response.json({ markets: [MARKET] })
      }
      if (url.includes('/v1/perps/twap/orders')) {
        twapUrl = url
        authorization = new Headers(init?.headers).get('Authorization')
        return Response.json({
          success: true,
          result: [
            {
              twapId: 'twap_a1b2c3',
              market: 'TSLA-USD',
              side: 'sell',
              size: '12',
              filledSize: '3',
              filledCost: '744.75',
              runningTime: 1800,
              createdAt: '2026-04-01T14:30:00.000Z',
              status: 'running',
            },
            {
              twapId: 'twap_unfilled',
              market: 'TSLA-USD',
              side: 'buy',
              size: '2',
              filledSize: '0',
              filledCost: '0',
              runningTime: 900,
              createdAt: '2026-04-01T14:35:00.000Z',
              status: 'running',
            },
          ],
        })
      }
      throw new Error(`Unhandled URL: ${url}`)
    }
    const storage = createMemoryStorage()
    await new OndoTokenStore(storage, API_URL).set(ADDRESS, TOKEN)
    const client = createPerpsClient({
      integrator: 'twap-test',
      apiKey: 'test-key',
      retry: false,
      fetch: fetchImpl,
      providers: [ondoProvider({ apiUrl: API_URL, storage })],
    })
    const provider = client.getProvider('ondo')
    if (provider === undefined) {
      throw new Error('ondo provider was not registered')
    }
    if (provider.getRunningTwaps === undefined) {
      throw new Error('ondo provider does not implement getRunningTwaps')
    }

    const result = await provider.getRunningTwaps({
      address: ADDRESS,
      marketId: 'TSLA-USD',
    })

    expect(twapUrl).toBe(`${API_URL}/v1/perps/twap/orders?market=TSLA-USD`)
    expect(authorization).toBe('Bearer session-jwt')
    expect(result).toEqual([
      {
        twapId: 'twap_a1b2c3',
        market: expect.objectContaining({ id: 'TSLA-USD' }),
        side: OrderSide.SELL,
        totalSize: '12',
        filledSize: '3',
        avgFillPrice: '248.25',
        startedAt: '2026-04-01T14:30:00.000Z',
        durationSeconds: 1800,
        status: TwapOrderStatus.RUNNING,
      },
      {
        twapId: 'twap_unfilled',
        market: expect.objectContaining({ id: 'TSLA-USD' }),
        side: OrderSide.BUY,
        totalSize: '2',
        filledSize: '0',
        startedAt: '2026-04-01T14:35:00.000Z',
        durationSeconds: 900,
        status: TwapOrderStatus.RUNNING,
      },
    ])
  })
})
