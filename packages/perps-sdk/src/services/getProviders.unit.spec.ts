import { describe, expect, it } from 'vitest'
import { mockProviders } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
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

  it('should include setup + options descriptors for each provider', async () => {
    const result = await getProviders(client)

    // Hyperliquid: two setup gates (APPROVE_AGENT + APPROVE_BUILDER_FEE)
    // and one option (ACCOUNT_MODE).
    expect(result.providers[0].setup).toBeDefined()
    expect(result.providers[0].setup).toHaveLength(2)
    expect(result.providers[0].options).toBeDefined()
    expect(result.providers[0].options).toHaveLength(1)
  })

  it('should support AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      getProviders(client, { signal: controller.signal })
    ).rejects.toThrow()
  })
})
