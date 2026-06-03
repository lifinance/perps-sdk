import type { OrdersResponse } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { mockOrders } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import type { PerpsProviderPlugin } from '../types/core.js'
import { getOrders } from './getOrders.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const makeClient = () => {
  const getOrdersSpy = vi.fn(async (): Promise<OrdersResponse> => mockOrders)
  const plugin = {
    type: 'hyperliquid',
    getOrders: getOrdersSpy,
  } as unknown as PerpsProviderPlugin
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    providers: [plugin],
  })
  return { client, getOrdersSpy }
}

describe('getOrders', () => {
  it('delegates to the venue plugin with the mapped params and returns its result', async () => {
    const { client, getOrdersSpy } = makeClient()

    const result = await getOrders(client, {
      provider: 'hyperliquid',
      address: ADDRESS,
      marketId: 'ETH',
      limit: 50,
      cursor: 'cursor-2',
    })

    expect(result).toEqual(mockOrders)
    expect(getOrdersSpy).toHaveBeenCalledWith(
      client,
      { address: ADDRESS, marketId: 'ETH', limit: 50, cursor: 'cursor-2' },
      undefined
    )
  })

  it('passes undefined for omitted optional filters', async () => {
    const { client, getOrdersSpy } = makeClient()

    await getOrders(client, { provider: 'hyperliquid', address: ADDRESS })

    expect(getOrdersSpy).toHaveBeenCalledWith(
      client,
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
    const { client, getOrdersSpy } = makeClient()
    const controller = new AbortController()

    await getOrders(
      client,
      { provider: 'hyperliquid', address: ADDRESS },
      { signal: controller.signal }
    )

    expect(getOrdersSpy).toHaveBeenCalledWith(
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
      getOrders(client, { provider: 'hyperliquid', address: ADDRESS })
    ).rejects.toThrow(/Provider plugin not registered: 'hyperliquid'/)
  })
})
