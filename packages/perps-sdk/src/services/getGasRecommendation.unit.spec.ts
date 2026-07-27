import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import { getGasRecommendation, LIFI_API_URL } from './getGasRecommendation.js'

const client = createPerpsClient({
  integrator: 'test-app',
  apiKey: 'test-key',
  retry: false,
})

const available = {
  available: true,
  recommended: {
    amount: '2000000000000000',
    amountUsd: '5.00',
    token: {
      address: '0x0000000000000000000000000000000000000000',
      chainId: 1,
      symbol: 'ETH',
      decimals: 18,
    },
  },
  limit: {
    amount: '4000000000000000',
    amountUsd: '10.00',
  },
}

describe('getGasRecommendation', () => {
  it('reads the LI.FI gas suggestion for the requested chain', async () => {
    let requestedUrl: string | null = null
    server.use(
      http.get(`${LIFI_API_URL}/gas/suggestion/:chain`, ({ request }) => {
        requestedUrl = request.url
        return HttpResponse.json(available)
      })
    )

    const result = await getGasRecommendation(client, { chainId: 1 })

    expect(requestedUrl).toBe(`${LIFI_API_URL}/gas/suggestion/1`)
    expect(result).toEqual(available)
  })

  it('returns the unavailable suggestion for a chain LI.FI cannot source gas on', async () => {
    server.use(
      http.get(`${LIFI_API_URL}/gas/suggestion/4663`, () =>
        HttpResponse.json({
          available: false,
          message: 'Gas is not available for this chain',
        })
      )
    )

    const result = await getGasRecommendation(client, { chainId: 4663 })

    expect(result.available).toBe(false)
    expect(result.recommended).toBeUndefined()
  })

  it('surfaces an API error response', async () => {
    server.use(
      http.get(`${LIFI_API_URL}/gas/suggestion/1`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 })
      )
    )

    await expect(getGasRecommendation(client, { chainId: 1 })).rejects.toThrow()
  })
})
