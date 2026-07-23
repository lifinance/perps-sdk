import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockMarkets, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { getMarkets } from './getMarkets.js'

const client = createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })

describe('getMarkets', () => {
  it('passes provider as a query param and returns the markets', async () => {
    let provider: string | undefined
    let marketIds: string | null = null

    server.use(
      http.get(`${DEFAULT_API_URL}/markets`, ({ request }) => {
        const url = new URL(request.url)
        provider = url.searchParams.get('provider') ?? undefined
        marketIds = url.searchParams.get('marketIds')
        return HttpResponse.json(mockMarkets)
      })
    )

    const result = await getMarkets(client, { provider: 'hyperliquid' })

    expect(provider).toBe('hyperliquid')
    // No marketIds filter supplied → param omitted entirely.
    expect(marketIds).toBeNull()
    expect(result).toEqual(mockMarkets)
  })

  it('excludes delisted markets from public selection', async () => {
    const delisted = {
      ...mockMarkets.markets[0],
      symbol: 'DELISTED',
      isDelisted: true,
    }
    server.use(
      http.get(`${DEFAULT_API_URL}/markets`, () =>
        HttpResponse.json({ markets: [...mockMarkets.markets, delisted] })
      )
    )

    const result = await getMarkets(client, { provider: 'hyperliquid' })

    expect(result.markets.map((market) => market.symbol)).toEqual([
      'BTC',
      'ETH',
    ])
  })

  it('joins marketIds into a comma-separated query param', async () => {
    let marketIds: string | null = null

    server.use(
      http.get(`${DEFAULT_API_URL}/markets`, ({ request }) => {
        marketIds = new URL(request.url).searchParams.get('marketIds')
        return HttpResponse.json(mockMarkets)
      })
    )

    await getMarkets(client, {
      provider: 'hyperliquid',
      marketIds: ['BTC', 'ETH'],
    })

    expect(marketIds).toBe('BTC,ETH')
  })

  it('propagates a backend error as a PerpsError', async () => {
    // retry disabled so the 5xx surfaces on the first attempt (no retry delay).
    const noRetryClient = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      retry: false,
    })

    server.use(
      http.get(`${DEFAULT_API_URL}/markets`, () =>
        HttpResponse.json(
          { code: 1011, message: 'upstream down', tool: 'lifi' },
          { status: 502 }
        )
      )
    )

    await expect(
      getMarkets(noRetryClient, { provider: 'hyperliquid' })
    ).rejects.toThrow('upstream down')
  })
})
