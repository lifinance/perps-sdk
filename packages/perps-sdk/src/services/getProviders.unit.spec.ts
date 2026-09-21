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

  it('should include setup descriptors for each provider', async () => {
    const result = await getProviders(client)

    expect(result.providers[0].setup).toBeDefined()
    expect(result.providers[0].setup).toHaveLength(3)
    expect(result.providers[0].setup.map((d) => d.kind)).toEqual([
      'approval',
      'approval',
      'preference',
    ])
  })

  it('should support AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      getProviders(client, { signal: controller.signal })
    ).rejects.toThrow()
  })
})
