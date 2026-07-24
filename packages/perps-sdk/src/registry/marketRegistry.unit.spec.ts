import type { Market, MarketsResponse } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { PerpsError } from '../errors/PerpsError.js'
import { getMarketRegistry, toMarketDisplay } from './marketRegistry.js'

const market = (id: string, categoryId: string): Market => ({
  providerId: 'hyperliquid',
  id,
  categoryId,
  baseAsset: {
    providerId: 'hyperliquid',
    id,
    displaySymbol: id,
    logoURI: `https://example.com/${id}.svg`,
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: 'https://example.com/USDC.svg',
  },
  szDecimals: 4,
  markPrice: '100',
  maxLeverage: 50,
  onlyIsolated: false,
  funding: { rate: '0.0001', nextFundingTime: 1704067200000 },
})

const BTC = market('BTC', 'hyperliquid')
const BRENT = market('xyz:BRENTOIL', 'xyz')
const SPOT = market('@123', 'spot')
const DELISTED = { ...market('DELISTED', 'hyperliquid'), isDelisted: true }

/** Serve `responses` in order, recording each request's cache mode. */
const serveMarkets = (responses: MarketsResponse[]) => {
  const requests: Array<{ provider: string | null; cache: RequestCache }> = []
  server.use(
    http.get(`${DEFAULT_API_URL}/markets`, ({ request }) => {
      requests.push({
        provider: new URL(request.url).searchParams.get('provider'),
        cache: request.cache,
      })
      const response =
        responses[Math.min(requests.length, responses.length) - 1]
      return HttpResponse.json(response)
    })
  )
  return requests
}

const freshClient = () =>
  createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })

describe('MarketRegistry', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('syncs the provider market list and indexes by Market.id', async () => {
    const requests = serveMarkets([{ markets: [BTC, BRENT] }])
    const registry = getMarketRegistry(freshClient(), 'hyperliquid')

    const markets = await registry.sync()

    expect(requests).toEqual([{ provider: 'hyperliquid', cache: 'default' }])
    expect(markets).toEqual([BTC, BRENT])
    expect(registry.markets).toEqual([BTC, BRENT])
    expect(registry.get('xyz:BRENTOIL')).toEqual(BRENT)
    expect(registry.require('BTC')).toEqual(BTC)
  })

  it('shares one in-flight fetch across concurrent sync calls', async () => {
    const requests = serveMarkets([{ markets: [BTC] }])
    const registry = getMarketRegistry(freshClient(), 'hyperliquid')

    await Promise.all([registry.sync(), registry.sync(), registry.sync()])

    expect(requests).toHaveLength(1)
  })

  it('refreshes a stale snapshot when a newly listed spot ID is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const requests = serveMarkets([
      { markets: [BTC] },
      { markets: [BTC, SPOT] },
    ])
    const registry = getMarketRegistry(freshClient(), 'hyperliquid')

    await registry.sync()
    expect(registry.get('@123')).toBeUndefined()

    await vi.waitFor(() => {
      expect(registry.get('@123')).toEqual(SPOT)
    })
    expect(requests).toHaveLength(2)
    expect(requests[1].cache).toBe('no-cache')
  })

  it('refetches on each non-concurrent sync, leaving freshness to the HTTP layer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const requests = serveMarkets([
      { markets: [BTC] },
      { markets: [BTC, BRENT] },
    ])
    const registry = getMarketRegistry(freshClient(), 'hyperliquid')

    await registry.sync()
    expect(registry.get('xyz:BRENTOIL')).toBeUndefined()
    await registry.sync()

    expect(requests).toHaveLength(3)
    expect(registry.get('xyz:BRENTOIL')).toEqual(BRENT)
  })

  it('keeps unknown-id warnings once across syncs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const requests = serveMarkets([{ markets: [BTC] }])
    const registry = getMarketRegistry(freshClient(), 'hyperliquid')
    await registry.sync()

    expect(registry.get('xyz:BRENTOIL')).toBeUndefined()
    expect(registry.get('xyz:BRENTOIL')).toBeUndefined()
    await registry.sync()
    expect(registry.get('xyz:BRENTOIL')).toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(requests).toHaveLength(3)
  })

  it('resolves known delisted markets for history but rejects them for active use', async () => {
    serveMarkets([{ markets: [BTC, DELISTED] }])
    const registry = getMarketRegistry(freshClient(), 'hyperliquid')
    await registry.sync()

    expect(registry.require('DELISTED')).toEqual(DELISTED)
    expect(registry.activeMarkets).toEqual([BTC])
    expect(() => registry.requireActive('DELISTED')).toThrow(PerpsError)
    expect(() => registry.requireActive('DELISTED')).toThrow(
      /not available for live use/
    )
  })

  it('require throws MarketNotFound for an id the backend does not know', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    serveMarkets([{ markets: [BTC] }])
    const registry = getMarketRegistry(freshClient(), 'hyperliquid')
    await registry.sync()

    let thrown: unknown
    try {
      registry.require('xyz:NOPE')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(PerpsError)
    expect((thrown as PerpsError).code).toBe(PerpsErrorCode.MarketNotFound)
  })

  it('returns the same instance per (client, provider) and distinct ones otherwise', () => {
    const a = freshClient()
    const b = freshClient()

    expect(getMarketRegistry(a, 'hyperliquid')).toBe(
      getMarketRegistry(a, 'hyperliquid')
    )
    expect(getMarketRegistry(a, 'hyperliquid')).not.toBe(
      getMarketRegistry(a, 'lighter')
    )
    expect(getMarketRegistry(a, 'hyperliquid')).not.toBe(
      getMarketRegistry(b, 'hyperliquid')
    )
  })
})

describe('toMarketDisplay', () => {
  it('projects exactly the display identity fields', () => {
    expect(toMarketDisplay(BRENT)).toEqual({
      providerId: 'hyperliquid',
      id: 'xyz:BRENTOIL',
      categoryId: 'xyz',
      baseAsset: BRENT.baseAsset,
      quoteAsset: BRENT.quoteAsset,
    })
  })
})
