import { createPerpsClient } from '@lifi/perps-sdk'
import { afterEach, describe, expect, it } from 'vitest'
import { HL_MARKETS } from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getAvailableToTrade } from './getAvailableToTrade.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})
const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

const activeAssetData = (availableToTrade: unknown) => ({
  user: ADDRESS.toLowerCase(),
  coin: 'BTC',
  leverage: { type: 'cross', value: 20 },
  maxTradeSzs: ['0.0003', '0.0003'],
  availableToTrade,
  markPx: '95000.0',
})

describe('getAvailableToTrade', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('reads both sides from the recorded pair', async () => {
    ;({ restore } = installInfoFetchMock(
      { activeAssetData: activeAssetData(['431.749348', '182.319517']) },
      HL_MARKETS
    ))

    await expect(
      getAvailableToTrade(ctx, { address: ADDRESS, marketId: 'BTC' })
    ).resolves.toMatchObject({ buy: '431.749348', sell: '182.319517' })
  })

  it.each([
    ['a single amount', ['431.749348']],
    ['an empty list', []],
    ['three amounts', ['1', '2', '3']],
  ])('rejects %s instead of reporting an undefined side', async (_name, amounts) => {
    ;({ restore } = installInfoFetchMock(
      { activeAssetData: activeAssetData(amounts) },
      HL_MARKETS
    ))

    await expect(
      getAvailableToTrade(ctx, { address: ADDRESS, marketId: 'BTC' })
    ).rejects.toThrow(/availableToTrade amounts for market 'BTC'/)
  })
})
