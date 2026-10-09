import type { ProvidersResponse, SetupAgreement } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockProviders, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { getProviders } from './getProviders.js'

describe('getProviders', () => {
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
  })

  it('should return list of providers', async () => {
    const result = await getProviders(client)

    expect(result).toEqual(mockProviders)
    expect(result.providers).toHaveLength(2)
    expect(result.providers.map((p) => p.key)).toEqual([
      'hyperliquid',
      'lighter',
    ])
  })

  it('should include setup descriptors for each provider', async () => {
    const result = await getProviders(client)

    expect(result.providers[0].setup).toBeDefined()
    expect(result.providers[0].setup).toHaveLength(3)
    expect(result.providers[0].setup.map((d) => d.options !== null)).toEqual([
      false,
      false,
      true,
    ])
  })

  it('passes setup agreements through unchanged', async () => {
    const agreements: SetupAgreement[] = [
      { title: 'Terms of Use', url: 'https://example.invalid/terms' },
      { title: 'Privacy Policy', url: 'https://example.invalid/privacy' },
    ]
    const [provider] = mockProviders.providers
    const fixture: ProvidersResponse = {
      providers: [
        {
          ...provider,
          setup: [{ ...provider.setup[0], agreements }],
        },
      ],
    }
    server.use(
      http.get(`${DEFAULT_API_URL}/providers`, () => HttpResponse.json(fixture))
    )

    const result = await getProviders(client)

    expect(result.providers[0].setup[0].agreements).toEqual(agreements)
    expect(result).toEqual(fixture)
  })

  it('should support AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      getProviders(client, { signal: controller.signal })
    ).rejects.toThrow()
  })
})
