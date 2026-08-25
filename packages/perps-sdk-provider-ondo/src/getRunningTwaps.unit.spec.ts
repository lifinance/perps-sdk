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
import type { OndoTwapOrder } from './types/wire.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const API_URL = 'https://ondo.test'
const MARKET: Market = {
  providerId: 'ondo',
  id: 'TSLA-USD.P',
  categoryId: 'ondo',
  baseAsset: {
    providerId: 'ondo',
    id: 'TSLA',
    displaySymbol: 'TSLA',
    logoURI: '',
    displayName: 'Tesla',
    decimals: 18,
  },
  quoteAsset: {
    providerId: 'ondo',
    id: 'USD',
    displaySymbol: 'USD',
    logoURI: '',
    displayName: 'US Dollar',
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

const RUNNING_PATH = '/v1/perps/twap/orders/running'

/** A `TWAPOrderApiResp` row as `GET /v1/perps/twap/orders/running` returns it. */
const twapFixture = (
  overrides: Partial<OndoTwapOrder> = {}
): OndoTwapOrder => ({
  twapId: 'twap_70a37d8f972f2494837f9dba8364cbb4',
  market: 'TSLA-USD.P',
  side: 'sell',
  startTime: '2026-04-01T14:30:00Z',
  runningTime: 1800,
  frequency: 60,
  avgFilledPrice: '248.25',
  filledSize: '3',
  totalSize: '12',
  totalFees: '1.14',
  orderStatus: 'running',
  reduceOnly: false,
  successfulOrders: 5,
  failedOrders: 0,
  ...overrides,
})

interface Probe {
  twapUrl: string | undefined
  authorization: string | null | undefined
}

/**
 * Route on the exact pathname and 404 every other `/v1/perps/twap` path, the
 * way the venue answers a path it does not serve.
 */
const ondoFetch = (
  result: OndoTwapOrder[] | null,
  probe: Probe
): typeof fetch => {
  return async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/markets')) {
      return Response.json({ markets: [MARKET] })
    }
    if (url.pathname === RUNNING_PATH) {
      probe.twapUrl = String(input)
      probe.authorization = new Headers(init?.headers).get('Authorization')
      return Response.json({ success: true, result })
    }
    if (url.pathname.startsWith('/v1/perps/twap')) {
      return Response.json(
        { success: false, error: 'not found', error_code: 'not_found' },
        { status: 404 }
      )
    }
    throw new Error(`Unhandled URL: ${String(input)}`)
  }
}

const runningTwaps = async (
  result: OndoTwapOrder[] | null,
  probe: Probe,
  marketId?: string
) => {
  const storage = createMemoryStorage()
  await new OndoTokenStore(storage, API_URL).set(ADDRESS, TOKEN)
  const client = createPerpsClient({
    integrator: 'twap-test',
    apiKey: 'test-key',
    retry: false,
    fetch: ondoFetch(result, probe),
    providers: [ondoProvider({ apiUrl: API_URL, storage })],
  })
  const provider = client.getProvider('ondo')
  if (provider === undefined) {
    throw new Error('ondo provider was not registered')
  }
  if (provider.getRunningTwaps === undefined) {
    throw new Error('ondo provider does not implement getRunningTwaps')
  }
  return provider.getRunningTwaps({
    address: ADDRESS,
    ...(marketId === undefined ? {} : { marketId }),
  })
}

describe('Ondo getRunningTwaps', () => {
  it('reads the running-TWAP feed and maps the venue TWAPOrderApiResp fields', async () => {
    const probe: Probe = { twapUrl: undefined, authorization: undefined }

    const result = await runningTwaps(
      [
        twapFixture(),
        twapFixture({
          twapId: 'twap_unfilled',
          side: 'buy',
          startTime: '2026-04-01T14:35:00Z',
          runningTime: 900,
          avgFilledPrice: '0',
          filledSize: '0',
          totalSize: '2',
          totalFees: '0',
          successfulOrders: 0,
        }),
      ],
      probe,
      'TSLA-USD.P'
    )

    expect(probe.twapUrl).toBe(`${API_URL}${RUNNING_PATH}?market=TSLA-USD.P`)
    expect(probe.authorization).toBe('Bearer session-jwt')
    expect(result).toEqual([
      {
        twapId: 'twap_70a37d8f972f2494837f9dba8364cbb4',
        market: expect.objectContaining({ id: 'TSLA-USD.P' }),
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
        market: expect.objectContaining({ id: 'TSLA-USD.P' }),
        side: OrderSide.BUY,
        totalSize: '2',
        filledSize: '0',
        startedAt: '2026-04-01T14:35:00.000Z',
        durationSeconds: 900,
        status: TwapOrderStatus.RUNNING,
      },
    ])
  })

  it('reads every market when no marketId narrows the request', async () => {
    const probe: Probe = { twapUrl: undefined, authorization: undefined }

    const result = await runningTwaps([twapFixture()], probe)

    expect(probe.twapUrl).toBe(`${API_URL}${RUNNING_PATH}`)
    expect(result).toHaveLength(1)
  })

  it('returns no rows when the venue marshals an empty feed as a null result', async () => {
    const probe: Probe = { twapUrl: undefined, authorization: undefined }

    await expect(runningTwaps(null, probe)).resolves.toEqual([])
  })
})
