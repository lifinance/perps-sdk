import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockPrices, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { getPrices } from './getPrices.js'

const client = createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })

describe('getPrices', () => {
  it('passes provider as a query param and returns the price map', async () => {
    let provider: string | undefined
    let marketIds: string | null = null

    server.use(
      http.get(`${DEFAULT_API_URL}/prices`, ({ request }) => {
        const url = new URL(request.url)
        provider = url.searchParams.get('provider') ?? undefined
        marketIds = url.searchParams.get('marketIds')
        return HttpResponse.json(mockPrices)
      })
    )

    const result = await getPrices(client, { provider: 'hyperliquid' })

    expect(provider).toBe('hyperliquid')
    expect(marketIds).toBeNull()
    expect(result).toEqual(mockPrices)
  })

  it('joins marketIds into a comma-separated query param', async () => {
    let marketIds: string | null = null

    server.use(
      http.get(`${DEFAULT_API_URL}/prices`, ({ request }) => {
        marketIds = new URL(request.url).searchParams.get('marketIds')
        return HttpResponse.json(mockPrices)
      })
    )

    await getPrices(client, {
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
      http.get(`${DEFAULT_API_URL}/prices`, () =>
        HttpResponse.json(
          { code: 1011, message: 'prices unavailable', tool: 'lifi' },
          { status: 503 }
        )
      )
    )

    await expect(
      getPrices(noRetryClient, { provider: 'hyperliquid' })
    ).rejects.toThrow('prices unavailable')
  })
})
