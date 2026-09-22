import { createPerpsClient } from '@lifi/perps-sdk'
import type { Market, MarketContext } from '@lifi/perps-types'
import type { Address } from 'viem'
import { afterEach, describe, expect, it } from 'vitest'
import {
  installInfoFetchMock,
  type RecordedRequest,
} from '../test/mockFetch.js'
import {
  PM_MARKETS,
  PM_PRICES,
  PM_SNAPSHOT,
  type RecordedSnapshot,
  STANDARD_MARKETS,
  STANDARD_PRICES,
  STANDARD_SNAPSHOT,
  UNIFIED_MARKETS,
  UNIFIED_PRICES,
  UNIFIED_SNAPSHOT,
} from '../test/venueFixtures.js'
import { DEFAULT_HYPERLIQUID_API_URL } from './constants.js'
import { getAvailableToTrade } from './services/getAvailableToTrade.js'

const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})
const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

let restore: (() => void) | undefined
afterEach(() => {
  restore?.()
  restore = undefined
})

/**
 * Serve one market's recorded `activeAssetData`. The mock keys responses by
 * `/info` type, so a multi-market case re-installs it per market.
 */
const install = (
  responses: Record<string, unknown>,
  markets: Market[],
  prices: MarketContext[]
): RecordedRequest[] => {
  restore?.()
  const mock = installInfoFetchMock(responses, markets, prices)
  restore = mock.restore
  return mock.requests
}

const readMarket = (
  snapshot: RecordedSnapshot,
  markets: Market[],
  prices: MarketContext[],
  marketId: string
) => {
  install(
    { activeAssetData: snapshot.activeAssetData[marketId] },
    markets,
    prices
  )
  return getAvailableToTrade(ctx, {
    address: snapshot.address as Address,
    marketId,
  })
}

const cases: [string, RecordedSnapshot, Market[], MarketContext[]][] = [
  ['unified account', UNIFIED_SNAPSHOT, UNIFIED_MARKETS, UNIFIED_PRICES],
  ['standard account', STANDARD_SNAPSHOT, STANDARD_MARKETS, STANDARD_PRICES],
  ['portfolio-margin account', PM_SNAPSHOT, PM_MARKETS, PM_PRICES],
]

describe.each(
  cases
)('availableToTrade.venue: %s', (_name, snapshot, markets, prices) => {
  const marketIds = Object.keys(snapshot.activeAssetData)

  it.each(
    marketIds
  )('getAvailableToTrade equals the recorded availableToTrade for %s', async (marketId) => {
    const result = await readMarket(snapshot, markets, prices, marketId)
    expect([result?.buy, result?.sell]).toEqual(
      snapshot.activeAssetData[marketId].availableToTrade
    )
  })

  it.each(
    marketIds
  )('reports the market identity and its margin asset for %s', async (marketId) => {
    const market = markets.find((m) => m.id === marketId)
    const result = await readMarket(snapshot, markets, prices, marketId)
    expect(result?.providerId).toBe('hyperliquid')
    expect(result?.marketId).toBe(marketId)
    expect(result?.asset.id).toBe(market?.quoteAsset.id)
    expect(result?.asset.displaySymbol).toBe('USDC')
  })
})

describe('availableToTrade.venue: spot market', () => {
  it('resolves undefined and reads no activeAssetData', async () => {
    const requests = install({}, UNIFIED_MARKETS, UNIFIED_PRICES)
    const result = await getAvailableToTrade(ctx, {
      address: UNIFIED_SNAPSHOT.address as Address,
      marketId: '@107',
    })
    expect(result).toBeUndefined()
    expect(requests).toHaveLength(0)
  })
})
