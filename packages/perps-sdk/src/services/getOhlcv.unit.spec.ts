import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { getOhlcv } from './getOhlcv.js'

const EMPTY_OHLCV = {
  provider: 'lighter',
  marketId: '',
  interval: '1h',
  candles: [],
}

describe('getOhlcv', () => {
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
  })

  it('sends marketId as a query param so spot pairs containing "/" need no path encoding', async () => {
    let capturedMarketId: string | undefined
    let capturedPath: string | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/ohlcv`, ({ request }) => {
        const url = new URL(request.url)
        capturedMarketId = url.searchParams.get('marketId') ?? undefined
        capturedPath = url.pathname
        return HttpResponse.json({ ...EMPTY_OHLCV, marketId: 'LINK/USDC' })
      })
    )

    await getOhlcv(client, {
      provider: 'lighter',
      marketId: 'LINK/USDC',
      interval: '1h',
    })

    expect(capturedMarketId).toBe('LINK/USDC')
    expect(capturedPath).toBe('/v1/perps/ohlcv')
  })

  it('passes plain perp marketIds through as a query param', async () => {
    let capturedMarketId: string | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/ohlcv`, ({ request }) => {
        capturedMarketId =
          new URL(request.url).searchParams.get('marketId') ?? undefined
        return HttpResponse.json({ ...EMPTY_OHLCV, marketId: 'BTC' })
      })
    )

    await getOhlcv(client, {
      provider: 'hyperliquid',
      marketId: 'BTC',
      interval: '1h',
    })

    expect(capturedMarketId).toBe('BTC')
  })
})
