import type { Order } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { mockOrder } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import type { PerpsProviderPlugin } from '../types/core.js'
import { getOrder } from './getOrder.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const makeClient = () => {
  const getOrderSpy = vi.fn(async (): Promise<Order> => mockOrder)
  const plugin = {
    type: 'hyperliquid',
    getOrder: getOrderSpy,
  } as unknown as PerpsProviderPlugin
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    providers: [plugin],
  })
  return { client, getOrderSpy }
}

describe('getOrder', () => {
  it('delegates to the venue plugin with the address and id and returns its result', async () => {
    const { client, getOrderSpy } = makeClient()

    const result = await getOrder(client, {
      provider: 'hyperliquid',
      address: ADDRESS,
      id: 'order1',
    })

    expect(result).toEqual(mockOrder)
    expect(getOrderSpy).toHaveBeenCalledWith(
      client,
      { address: ADDRESS, id: 'order1' },
      undefined
    )
  })

  it('forwards request options (signal) to the plugin', async () => {
    const { client, getOrderSpy } = makeClient()
    const controller = new AbortController()

    await getOrder(
      client,
      { provider: 'hyperliquid', address: ADDRESS, id: 'order1' },
      { signal: controller.signal }
    )

    expect(getOrderSpy).toHaveBeenCalledWith(
      client,
      { address: ADDRESS, id: 'order1' },
      { signal: controller.signal }
    )
  })

  it('throws when no provider plugin is registered', async () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
    })

    await expect(
      getOrder(client, { provider: 'hyperliquid', address: ADDRESS, id: 'x' })
    ).rejects.toThrow(/Provider plugin not registered: 'hyperliquid'/)
  })
})
