import type {
  AccountResponse,
  ActivitiesResponse,
  FillsResponse,
  Order,
  OrdersResponse,
  PositionsResponse,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { createPerpsClient } from '../client/createPerpsClient.js'
import type { PerpsProviderPlugin } from './core.js'

function makeStubProvider(type: string): PerpsProviderPlugin {
  const stub = async (): Promise<never> => {
    throw new Error('not implemented')
  }
  return {
    type,
    bind: () => {},
    getAccount: () => stub() as unknown as Promise<AccountResponse>,
    getPositions: () => stub() as unknown as Promise<PositionsResponse>,
    getOrders: () => stub() as unknown as Promise<OrdersResponse>,
    getOrder: () => stub() as unknown as Promise<Order>,
    getFills: () => stub() as unknown as Promise<FillsResponse>,
    getActivity: () => stub() as unknown as Promise<ActivitiesResponse>,
    projectConfig: () => [],
  }
}

describe('PerpsProvider integration with createPerpsClient', () => {
  it('exposes bound providers via client.providers in registration order', () => {
    const hl = makeStubProvider('hyperliquid')
    const lighter = makeStubProvider('lighter')
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: [hl, lighter],
    })

    expect(client.providers.map((p) => p.type)).toEqual([
      'hyperliquid',
      'lighter',
    ])
  })

  it('looks bound providers up by type via getProvider', () => {
    const hl = makeStubProvider('hyperliquid')
    const lighter = makeStubProvider('lighter')
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: [hl, lighter],
    })

    expect(client.getProvider('hyperliquid')?.type).toBe('hyperliquid')
    expect(client.getProvider('lighter')?.type).toBe('lighter')
  })

  it('returns undefined for an unknown provider key', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: [makeStubProvider('hyperliquid')],
    })

    expect(client.getProvider('unknown')).toBeUndefined()
  })

  it('defaults providers to an empty array when none are passed', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
    })

    expect(client.providers).toEqual([])
    expect(client.getProvider('anything')).toBeUndefined()
  })

  it('accepts the legacy ProviderConfigs shape and routes it to config.providers', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: { hyperliquid: { markets: ['BTC', 'ETH'] } },
    })

    expect(client.providers).toEqual([])
    expect(client.config.providers).toEqual({
      hyperliquid: { markets: ['BTC', 'ETH'] },
    })
  })

  it('keeps config.providers undefined when the plugin array is passed', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: [makeStubProvider('hyperliquid')],
    })

    expect(client.config.providers).toBeUndefined()
  })

  it('injects the client via bind so the clientless read can resolve it', async () => {
    let boundIntegrator: string | undefined
    const plugin: PerpsProviderPlugin = {
      ...makeStubProvider('hyperliquid'),
      bind: (client) => {
        boundIntegrator = client.config.integrator
      },
      getAccount: async (params) =>
        ({
          balances: [],
          totalEquity: '0',
          marginUsed: '0',
          marginAvailable: '0',
          config: { provider: 'hyperliquid' },
          extra: { address: params.address },
        }) as unknown as AccountResponse,
    }
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: [plugin],
    })

    expect(boundIntegrator).toBe('test-app')

    const result = await client.getProvider('hyperliquid')!.getAccount({
      address: '0x0000000000000000000000000000000000000000',
    })

    expect(result).toBeDefined()
  })
})
