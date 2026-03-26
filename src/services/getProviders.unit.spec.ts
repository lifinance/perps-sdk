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
    expect(result.providers).toHaveLength(1)
    expect(result.providers[0].key).toBe('hyperliquid')
  })

  it('should include prepareAccountActions for each provider', async () => {
    const result = await getProviders(client)

    expect(result.providers[0].prepareAccountActions).toBeDefined()
    expect(result.providers[0].prepareAccountActions).toHaveLength(4)
  })

  it('should support AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      getProviders(client, { signal: controller.signal })
    ).rejects.toThrow()
  })
})
