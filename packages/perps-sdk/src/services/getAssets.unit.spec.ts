import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { getAssets } from './getAssets.js'

describe('getAssets', () => {
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
  })

  it('passes provider as a query param and returns the asset registry', async () => {
    let capturedProvider: string | undefined
    let capturedPath: string | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/assets`, ({ request }) => {
        const url = new URL(request.url)
        capturedProvider = url.searchParams.get('provider') ?? undefined
        capturedPath = url.pathname
        return HttpResponse.json({
          assets: [
            {
              providerId: 'lighter',
              id: '3',
              displaySymbol: 'USDC',
              logoURI: 'https://x/usdc.png',
            },
          ],
        })
      })
    )

    const { assets } = await getAssets(client, { provider: 'lighter' })

    expect(capturedProvider).toBe('lighter')
    expect(capturedPath).toBe('/v1/perps/assets')
    expect(assets).toEqual([
      {
        providerId: 'lighter',
        id: '3',
        displaySymbol: 'USDC',
        logoURI: 'https://x/usdc.png',
      },
    ])
  })
})
