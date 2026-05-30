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
  assetId: '',
  interval: '1h',
  candles: [],
}

describe('getOhlcv', () => {
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
  })

  it('sends assetId as a query param so spot pairs containing "/" need no path encoding', async () => {
    let capturedAssetId: string | undefined
    let capturedPath: string | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/ohlcv`, ({ request }) => {
        const url = new URL(request.url)
        capturedAssetId = url.searchParams.get('assetId') ?? undefined
        capturedPath = url.pathname
        return HttpResponse.json({ ...EMPTY_OHLCV, assetId: 'LINK/USDC' })
      })
    )

    await getOhlcv(client, {
      provider: 'lighter',
      assetId: 'LINK/USDC',
      interval: '1h',
    })

    expect(capturedAssetId).toBe('LINK/USDC')
    expect(capturedPath).toBe('/v1/perps/ohlcv')
  })

  it('passes plain perp assetIds through as a query param', async () => {
    let capturedAssetId: string | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/ohlcv`, ({ request }) => {
        capturedAssetId =
          new URL(request.url).searchParams.get('assetId') ?? undefined
        return HttpResponse.json({ ...EMPTY_OHLCV, assetId: 'BTC' })
      })
    )

    await getOhlcv(client, {
      provider: 'hyperliquid',
      assetId: 'BTC',
      interval: '1h',
    })

    expect(capturedAssetId).toBe('BTC')
  })
})
