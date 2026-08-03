import { createPerpsClient } from '@lifi/perps-sdk'
import { OrderSide, TwapOrderStatus } from '@lifi/perps-types'
import { afterEach, describe, expect, it } from 'vitest'
import { HL_MARKETS } from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getRunningTwaps } from './getRunningTwaps.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'twap-test',
  apiKey: 'test-key',
  retry: false,
})
const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

const activeTwap = {
  time: 1_775_000_000,
  state: {
    coin: 'BTC',
    executedNtl: '19000',
    executedSz: '0.2',
    minutes: 15,
    randomize: true,
    reduceOnly: false,
    side: 'B',
    stopPx: null,
    sz: '0.5',
    timestamp: 1_775_000_000_000,
    trigger: null,
    user: ADDRESS,
  },
  status: { status: 'activated' },
  twapId: 3156,
}

describe('Hyperliquid getRunningTwaps', () => {
  let restore: (() => void) | undefined

  afterEach(() => restore?.())

  it('reads twapHistory directly and maps only activated entries', async () => {
    const installed = installInfoFetchMock(
      {
        twapHistory: [
          activeTwap,
          {
            ...activeTwap,
            state: {
              ...activeTwap.state,
              executedNtl: '0',
              executedSz: '0',
            },
            twapId: 3157,
          },
          {
            ...activeTwap,
            status: { status: 'finished' },
            twapId: 3155,
          },
        ],
      },
      HL_MARKETS
    )
    restore = installed.restore

    const result = await getRunningTwaps(ctx, { address: ADDRESS })

    expect(installed.requests).toEqual([
      {
        url: `${DEFAULT_HYPERLIQUID_API_URL}/info`,
        body: { type: 'twapHistory', user: ADDRESS },
      },
    ])
    expect(result).toEqual([
      {
        twapId: '3156',
        market: expect.objectContaining({ id: 'BTC' }),
        side: OrderSide.BUY,
        totalSize: '0.5',
        filledSize: '0.2',
        avgFillPrice: '95000',
        startedAt: new Date(1_775_000_000_000).toISOString(),
        durationSeconds: 900,
        status: TwapOrderStatus.RUNNING,
      },
      {
        twapId: '3157',
        market: expect.objectContaining({ id: 'BTC' }),
        side: OrderSide.BUY,
        totalSize: '0.5',
        filledSize: '0',
        startedAt: new Date(1_775_000_000_000).toISOString(),
        durationSeconds: 900,
        status: TwapOrderStatus.RUNNING,
      },
    ])
  })

  it('filters running TWAPs by normalized market id', async () => {
    const installed = installInfoFetchMock(
      { twapHistory: [activeTwap] },
      HL_MARKETS
    )
    restore = installed.restore

    await expect(
      getRunningTwaps(ctx, { address: ADDRESS, marketId: 'ETH' })
    ).resolves.toEqual([])
  })

  it('rejects an active state without the stable venue TWAP id', async () => {
    const installed = installInfoFetchMock(
      { twapHistory: [{ ...activeTwap, twapId: undefined }] },
      HL_MARKETS
    )
    restore = installed.restore

    await expect(getRunningTwaps(ctx, { address: ADDRESS })).rejects.toThrow(
      /without a twapId/
    )
  })
})
