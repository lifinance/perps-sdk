import { describe, expect, it } from 'vitest'
import { mockMeta } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import { getMeta } from './getMeta.js'

describe('getMeta', () => {
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
  })

  it('should return platform version and notices', async () => {
    const result = await getMeta(client)

    expect(result).toEqual(mockMeta)
    expect(result.version).toBe('1.4.2')
    expect(result.notices).toHaveLength(2)
  })

  it('should return notices with and without a link', async () => {
    const result = await getMeta(client)

    expect(result.notices[0].link).toBe('https://status.li.fi/maintenance')
    expect(result.notices[1].link).toBeUndefined()
  })

  it('should support AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      getMeta(client, { signal: controller.signal })
    ).rejects.toThrow()
  })
})
