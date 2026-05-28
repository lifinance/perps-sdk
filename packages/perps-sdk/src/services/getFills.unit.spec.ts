import type { FillsResponse } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { mockFills } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import type { PerpsProvider } from '../types/core.js'
import { getFills } from './getFills.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const makeClient = () => {
  const getFillsSpy = vi.fn(async (): Promise<FillsResponse> => mockFills)
  const plugin = {
    type: 'hyperliquid',
    getFills: getFillsSpy,
  } as unknown as PerpsProvider
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    providers: [plugin],
  })
  return { client, getFillsSpy }
}

describe('getFills', () => {
  it('delegates to the venue plugin with the mapped params and returns its result', async () => {
    const { client, getFillsSpy } = makeClient()

    const result = await getFills(client, {
      provider: 'hyperliquid',
      address: ADDRESS,
      limit: 10,
      cursor: 'abc123',
      startTime: 1700000000000,
      endTime: 1700100000000,
    })

    expect(result).toEqual(mockFills)
    expect(getFillsSpy).toHaveBeenCalledWith(
      client,
      {
        address: ADDRESS,
        limit: 10,
        cursor: 'abc123',
        startTime: 1700000000000,
        endTime: 1700100000000,
      },
      undefined
    )
  })

  it('forwards request options (signal) to the plugin', async () => {
    const { client, getFillsSpy } = makeClient()
    const controller = new AbortController()

    await getFills(
      client,
      { provider: 'hyperliquid', address: ADDRESS },
      { signal: controller.signal }
    )

    expect(getFillsSpy).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ address: ADDRESS }),
      { signal: controller.signal }
    )
  })

  it('throws when no provider plugin is registered', async () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
    })
    await expect(
      getFills(client, { provider: 'hyperliquid', address: ADDRESS })
    ).rejects.toThrow(/Provider plugin not registered: 'hyperliquid'/)
  })
})
