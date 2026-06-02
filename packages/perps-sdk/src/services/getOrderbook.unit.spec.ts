import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockOrderbook, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { getOrderbook } from './getOrderbook.js'

const client = createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })

describe('getOrderbook', () => {
  it('passes provider and marketId as query params and returns the snapshot', async () => {
    let provider: string | undefined
    let marketId: string | undefined
    let depth: string | null = null

    server.use(
      http.get(`${DEFAULT_API_URL}/orderbook`, ({ request }) => {
        const url = new URL(request.url)
        provider = url.searchParams.get('provider') ?? undefined
        marketId = url.searchParams.get('marketId') ?? undefined
        depth = url.searchParams.get('depth')
        return HttpResponse.json(mockOrderbook)
      })
    )

    const result = await getOrderbook(client, {
      provider: 'hyperliquid',
      marketId: 'BTC',
    })

    expect(provider).toBe('hyperliquid')
    expect(marketId).toBe('BTC')
    // depth omitted → param absent.
    expect(depth).toBeNull()
    expect(result).toEqual(mockOrderbook)
  })

  it('includes the depth query param when provided', async () => {
    let depth: string | null = null

    server.use(
      http.get(`${DEFAULT_API_URL}/orderbook`, ({ request }) => {
        depth = new URL(request.url).searchParams.get('depth')
        return HttpResponse.json(mockOrderbook)
      })
    )

    await getOrderbook(client, {
      provider: 'hyperliquid',
      marketId: 'BTC',
      depth: 20,
    })

    expect(depth).toBe('20')
  })

  it('propagates a backend error as a PerpsError', async () => {
    // retry disabled so the 5xx surfaces on the first attempt (no retry delay).
    const noRetryClient = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      retry: false,
    })

    server.use(
      http.get(`${DEFAULT_API_URL}/orderbook`, () =>
        HttpResponse.json(
          { code: 1011, message: 'orderbook unavailable', tool: 'lifi' },
          { status: 502 }
        )
      )
    )

    await expect(
      getOrderbook(noRetryClient, { provider: 'hyperliquid', marketId: 'BTC' })
    ).rejects.toThrow('orderbook unavailable')
  })
})
