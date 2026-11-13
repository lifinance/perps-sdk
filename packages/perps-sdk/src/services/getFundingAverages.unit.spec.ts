import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockFundingAverages, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { getFundingAverages } from './getFundingAverages.js'

const client = createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })

describe('getFundingAverages', () => {
  it('passes provider as a query param and returns the backend averages unchanged', async () => {
    let provider: string | null = null
    let marketIds: string | null = null

    server.use(
      http.get(`${DEFAULT_API_URL}/fundingAverages`, ({ request }) => {
        const url = new URL(request.url)
        provider = url.searchParams.get('provider')
        marketIds = url.searchParams.get('marketIds')
        return HttpResponse.json(mockFundingAverages)
      })
    )

    const result = await getFundingAverages(client, { provider: 'hyperliquid' })

    expect(provider).toBe('hyperliquid')
    expect(marketIds).toBeNull()
    expect(result).toEqual(mockFundingAverages)
    expect(result.averages[1].rate['8h']).toBe('-0.0000040')
  })

  it('joins marketIds into a comma-separated query param', async () => {
    let marketIds: string | null = null

    server.use(
      http.get(`${DEFAULT_API_URL}/fundingAverages`, ({ request }) => {
        marketIds = new URL(request.url).searchParams.get('marketIds')
        return HttpResponse.json(mockFundingAverages)
      })
    )

    await getFundingAverages(client, {
      provider: 'hyperliquid',
      marketIds: ['BTC', 'ETH'],
    })

    expect(marketIds).toBe('BTC,ETH')
  })

  it('reads the backend on every call', async () => {
    let requests = 0

    server.use(
      http.get(`${DEFAULT_API_URL}/fundingAverages`, () => {
        requests += 1
        return HttpResponse.json(mockFundingAverages)
      })
    )

    await getFundingAverages(client, { provider: 'hyperliquid' })
    await getFundingAverages(client, { provider: 'hyperliquid' })

    expect(requests).toBe(2)
  })

  it('propagates a backend error as a PerpsError', async () => {
    const noRetryClient = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      retry: false,
    })

    server.use(
      http.get(`${DEFAULT_API_URL}/fundingAverages`, () =>
        HttpResponse.json(
          { code: 1011, message: 'funding averages unavailable', tool: 'lifi' },
          { status: 503 }
        )
      )
    )

    await expect(
      getFundingAverages(noRetryClient, { provider: 'hyperliquid' })
    ).rejects.toThrow('funding averages unavailable')
  })

  it('sends the provider header', async () => {
    let providerHeader: string | null = null

    server.use(
      http.get(`${DEFAULT_API_URL}/fundingAverages`, ({ request }) => {
        providerHeader = request.headers.get('x-perps-provider')
        return HttpResponse.json({ averages: [] })
      })
    )

    await getFundingAverages(client, { provider: 'lighter' })

    expect(providerHeader).toBe('lighter')
  })
})
