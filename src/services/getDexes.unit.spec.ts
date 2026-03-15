import { describe, expect, it } from 'vitest'
import { mockDexes } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import { getDexes } from './getDexes.js'

describe('getDexes', () => {
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
  })

  it('should return list of dexes', async () => {
    const result = await getDexes(client)

    expect(result).toEqual(mockDexes)
    expect(result.dexes).toHaveLength(1)
    expect(result.dexes[0].key).toBe('hyperliquid')
  })

  it('should include authorizations for each dex', async () => {
    const result = await getDexes(client)

    expect(result.dexes[0].authorizations).toBeDefined()
    expect(result.dexes[0].authorizations).toHaveLength(4)
  })

  it('should support AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      getDexes(client, { signal: controller.signal })
    ).rejects.toThrow()
  })
})
