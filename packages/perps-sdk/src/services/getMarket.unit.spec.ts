import { PerpsErrorCode } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockMarkets, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { PerpsError } from '../errors/PerpsError.js'
import { getMarket } from './getMarket.js'

const client = createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })

describe('getMarket', () => {
  it('queries /markets filtered by the single marketId and returns the first market', async () => {
    let provider: string | undefined
    let marketIds: string | null = null

    server.use(
      http.get(`${DEFAULT_API_URL}/markets`, ({ request }) => {
        const url = new URL(request.url)
        provider = url.searchParams.get('provider') ?? undefined
        marketIds = url.searchParams.get('marketIds')
        return HttpResponse.json({ markets: [mockMarkets.markets[0]] })
      })
    )

    const market = await getMarket(client, {
      provider: 'hyperliquid',
      marketId: 'BTC',
    })

    expect(provider).toBe('hyperliquid')
    // Single id is forwarded verbatim (not array-joined).
    expect(marketIds).toBe('BTC')
    expect(market).toEqual(mockMarkets.markets[0])
  })

  it('rejects a delisted market for live lookup', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/markets`, () =>
        HttpResponse.json({
          markets: [{ ...mockMarkets.markets[0], isDelisted: true }],
        })
      )
    )

    const error = await getMarket(client, {
      provider: 'hyperliquid',
      marketId: 'BTC',
    }).catch((e) => e)

    expect(error).toBeInstanceOf(PerpsError)
    expect(error.code).toBe(PerpsErrorCode.MarketNotFound)
    expect(error.tool).toBe('hyperliquid')
  })

  it('throws a MarketNotFound PerpsError when the backend yields an empty market list', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/markets`, () =>
        HttpResponse.json({ markets: [] })
      )
    )

    const error = await getMarket(client, {
      provider: 'hyperliquid',
      marketId: 'NOPE',
    }).catch((e) => e)

    expect(error).toBeInstanceOf(PerpsError)
    expect(error.code).toBe(PerpsErrorCode.MarketNotFound)
    expect(error.tool).toBe('hyperliquid')
  })

  it('propagates a 404 as a PerpsError', async () => {
    server.use(
      http.get(`${DEFAULT_API_URL}/markets`, () =>
        HttpResponse.json(
          { code: 1001, message: 'not found', tool: 'lifi' },
          { status: 404 }
        )
      )
    )

    await expect(
      getMarket(client, { provider: 'hyperliquid', marketId: 'BTC' })
    ).rejects.toThrow('not found')
  })
})
