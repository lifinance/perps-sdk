import { OrderStatus } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { createTestAgentProvider } from '../../test/agentProvider.js'
import { mockOrder } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import { getOrders } from './getOrders.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const allOrders = Object.values(OrderStatus).map((status) => ({
  ...mockOrder,
  orderId: status,
  status,
}))
const makeClient = () =>
  createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    providers: [
      createTestAgentProvider({
        type: 'hyperliquid',
        getOrders: async ({ statuses }) => ({
          provider: 'hyperliquid',
          orders: allOrders.filter((order) => statuses?.includes(order.status)),
          pagination: { limit: allOrders.length, hasMore: false },
        }),
      }),
    ],
  })

describe('getOrders', () => {
  it('selects all active lifecycle states by default', async () => {
    const result = await getOrders(makeClient(), {
      provider: 'hyperliquid',
      address: ADDRESS,
    })
    expect(result.orders.map((order) => order.status).sort()).toEqual(
      [
        OrderStatus.ACCEPTED,
        OrderStatus.PENDING,
        OrderStatus.OPEN,
        OrderStatus.PARTIALLY_FILLED,
        OrderStatus.TRIGGERED,
      ].sort()
    )
  })
  it('uses an explicit terminal status filter instead of the active default', async () => {
    const result = await getOrders(makeClient(), {
      provider: 'hyperliquid',
      address: ADDRESS,
      statuses: [OrderStatus.FILLED],
    })
    expect(result.orders.map((order) => order.status)).toEqual([
      OrderStatus.FILLED,
    ])
  })
  it('preserves an explicitly empty filter', async () => {
    const result = await getOrders(makeClient(), {
      provider: 'hyperliquid',
      address: ADDRESS,
      statuses: [],
    })
    expect(result.orders).toEqual([])
  })
  it('throws when no provider plugin is registered', async () => {
    await expect(
      getOrders(createPerpsClient({ integrator: 'test-app' }), {
        provider: 'hyperliquid',
        address: ADDRESS,
      })
    ).rejects.toThrow(/Provider plugin not registered/)
  })
})
