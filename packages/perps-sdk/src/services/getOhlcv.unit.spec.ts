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

  it('encodes assetId so spot pairs containing "/" reach :assetId intact', async () => {
    // Without encoding, "LINK/USDC" splits the path and Fastify's `:assetId`
    // captures only "LINK", leaving "USDC" as an unmatched segment → 404.
    let capturedAssetId: string | undefined
    let capturedRawPath: string | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/ohlcv/:assetId`, ({ params, request }) => {
        capturedAssetId = params.assetId as string
        capturedRawPath = new URL(request.url).pathname
        return HttpResponse.json({ ...EMPTY_OHLCV, assetId: 'LINK/USDC' })
      })
    )

    await getOhlcv(client, {
      provider: 'lighter',
      assetId: 'LINK/USDC',
      interval: '1h',
    })

    expect(capturedAssetId).toBe('LINK/USDC')
    expect(capturedRawPath).toBe('/v1/perps/ohlcv/LINK%2FUSDC')
  })

  it('passes plain perp assetIds through unchanged', async () => {
    let capturedRawPath: string | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/ohlcv/:assetId`, ({ request }) => {
        capturedRawPath = new URL(request.url).pathname
        return HttpResponse.json({ ...EMPTY_OHLCV, assetId: 'BTC' })
      })
    )

    await getOhlcv(client, {
      provider: 'hyperliquid',
      assetId: 'BTC',
      interval: '1h',
    })

    expect(capturedRawPath).toBe('/v1/perps/ohlcv/BTC')
  })
})
