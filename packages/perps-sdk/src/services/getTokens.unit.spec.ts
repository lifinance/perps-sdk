import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { getTokens } from './getTokens.js'

describe('getTokens', () => {
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
  })

  it('passes provider as a query param and returns the token registry', async () => {
    let capturedProvider: string | undefined
    let capturedPath: string | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/tokens`, ({ request }) => {
        const url = new URL(request.url)
        capturedProvider = url.searchParams.get('provider') ?? undefined
        capturedPath = url.pathname
        return HttpResponse.json({
          tokens: [{ id: '3', symbol: 'USDC', logoURI: 'https://x/usdc.png' }],
        })
      })
    )

    const { tokens } = await getTokens(client, { provider: 'lighter' })

    expect(capturedProvider).toBe('lighter')
    expect(capturedPath).toBe('/v1/perps/tokens')
    expect(tokens).toEqual([
      { id: '3', symbol: 'USDC', logoURI: 'https://x/usdc.png' },
    ])
  })
})
