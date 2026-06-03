import type { PositionsResponse } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { mockPositions } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import type { PerpsProviderPlugin } from '../types/core.js'
import { getPositions } from './getPositions.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const makeClient = () => {
  const getPositionsSpy = vi.fn(
    async (): Promise<PositionsResponse> => mockPositions
  )
  const plugin = {
    type: 'hyperliquid',
    bind: vi.fn(),
    getPositions: getPositionsSpy,
  } as unknown as PerpsProviderPlugin
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    providers: [plugin],
  })
  return { client, getPositionsSpy }
}

describe('getPositions', () => {
  it('delegates to the venue plugin with the mapped params and returns its result', async () => {
    const { client, getPositionsSpy } = makeClient()

    const result = await getPositions(client, {
      provider: 'hyperliquid',
      address: ADDRESS,
      marketId: 'BTC',
      limit: 25,
      cursor: 'next-page',
    })

    expect(result).toEqual(mockPositions)
    expect(getPositionsSpy).toHaveBeenCalledWith(
      { address: ADDRESS, marketId: 'BTC', limit: 25, cursor: 'next-page' },
      undefined
    )
  })

  it('passes undefined for omitted optional filters', async () => {
    const { client, getPositionsSpy } = makeClient()

    await getPositions(client, { provider: 'hyperliquid', address: ADDRESS })

    expect(getPositionsSpy).toHaveBeenCalledWith(
      {
        address: ADDRESS,
        marketId: undefined,
        limit: undefined,
        cursor: undefined,
      },
      undefined
    )
  })

  it('forwards request options (signal) to the plugin', async () => {
    const { client, getPositionsSpy } = makeClient()
    const controller = new AbortController()

    await getPositions(
      client,
      { provider: 'hyperliquid', address: ADDRESS },
      { signal: controller.signal }
    )

    expect(getPositionsSpy).toHaveBeenCalledWith(
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
      getPositions(client, { provider: 'hyperliquid', address: ADDRESS })
    ).rejects.toThrow(/Provider plugin not registered: 'hyperliquid'/)
  })
})
