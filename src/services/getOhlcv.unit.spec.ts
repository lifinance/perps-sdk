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

  it('encodes the symbol so spot pairs containing "/" reach :symbol intact', async () => {
    // Without encoding, "LINK/USDC" splits the path and Fastify's `:symbol`
    // captures only "LINK", leaving "USDC" as an unmatched segment → 404.
    let capturedSymbol: string | undefined
    let capturedRawPath: string | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/ohlcv/:symbol`, ({ params, request }) => {
        capturedSymbol = params.symbol as string
        capturedRawPath = new URL(request.url).pathname
        return HttpResponse.json({ ...EMPTY_OHLCV, assetId: 'LINK/USDC' })
      })
    )

    await getOhlcv(client, {
      provider: 'lighter',
      symbol: 'LINK/USDC',
      interval: '1h',
    })

    expect(capturedSymbol).toBe('LINK/USDC')
    expect(capturedRawPath).toBe('/v1/perps/ohlcv/LINK%2FUSDC')
  })

  it('passes plain perp symbols through unchanged', async () => {
    let capturedRawPath: string | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/ohlcv/:symbol`, ({ request }) => {
        capturedRawPath = new URL(request.url).pathname
        return HttpResponse.json({ ...EMPTY_OHLCV, assetId: 'BTC' })
      })
    )

    await getOhlcv(client, {
      provider: 'hyperliquid',
      symbol: 'BTC',
      interval: '1h',
    })

    expect(capturedRawPath).toBe('/v1/perps/ohlcv/BTC')
  })
})
