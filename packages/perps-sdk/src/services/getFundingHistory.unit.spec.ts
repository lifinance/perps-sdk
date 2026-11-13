import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockFundingHistory, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import {
  type GetFundingHistoryParams,
  getFundingHistory,
} from './getFundingHistory.js'

const client = createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })

describe('getFundingHistory', () => {
  it('sends provider, marketId and range as query params and returns the backend points unchanged', async () => {
    let query: URLSearchParams | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/fundingHistory`, ({ request }) => {
        query = new URL(request.url).searchParams
        return HttpResponse.json(mockFundingHistory)
      })
    )

    const result = await getFundingHistory(client, {
      provider: 'hyperliquid',
      marketId: 'BTC',
      range: '7d',
    })

    expect(query?.get('provider')).toBe('hyperliquid')
    expect(query?.get('marketId')).toBe('BTC')
    expect(query?.get('range')).toBe('7d')
    expect(result).toEqual(mockFundingHistory)
    expect(result.points.map(({ rate }) => rate)).toEqual([
      '0.0000125',
      '-0.0000031',
      '0.0000090',
    ])
  })

  it('sends a spot-style marketId as a query param, with no path encoding', async () => {
    let marketId: string | null = null
    let path: string | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/fundingHistory`, ({ request }) => {
        const url = new URL(request.url)
        marketId = url.searchParams.get('marketId')
        path = url.pathname
        return HttpResponse.json({
          ...mockFundingHistory,
          provider: 'lighter',
          marketId: 'LINK/USDC',
          range: '90d',
        })
      })
    )

    await getFundingHistory(client, {
      provider: 'lighter',
      marketId: 'LINK/USDC',
      range: '90d',
    })

    expect(marketId).toBe('LINK/USDC')
    expect(path).toBe('/v1/perps/fundingHistory')
  })

  it('reads the backend on every call', async () => {
    let requests = 0

    server.use(
      http.get(`${DEFAULT_API_URL}/fundingHistory`, () => {
        requests += 1
        return HttpResponse.json(mockFundingHistory)
      })
    )

    const params: GetFundingHistoryParams = {
      provider: 'hyperliquid',
      marketId: 'BTC',
      range: '30d',
    }
    await getFundingHistory(client, params)
    await getFundingHistory(client, params)

    expect(requests).toBe(2)
  })

  it('propagates a backend error as a PerpsError', async () => {
    const noRetryClient = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      retry: false,
    })

    server.use(
      http.get(`${DEFAULT_API_URL}/fundingHistory`, () =>
        HttpResponse.json(
          { code: 1011, message: 'funding history unavailable', tool: 'lifi' },
          { status: 503 }
        )
      )
    )

    await expect(
      getFundingHistory(noRetryClient, {
        provider: 'hyperliquid',
        marketId: 'BTC',
        range: '7d',
      })
    ).rejects.toThrow('funding history unavailable')
  })

  it('sends the provider header', async () => {
    let providerHeader: string | null = null

    server.use(
      http.get(`${DEFAULT_API_URL}/fundingHistory`, ({ request }) => {
        providerHeader = request.headers.get('x-perps-provider')
        return HttpResponse.json(mockFundingHistory)
      })
    )

    await getFundingHistory(client, {
      provider: 'ondo',
      marketId: 'BTC',
      range: '7d',
    })

    expect(providerHeader).toBe('ondo')
  })
})
