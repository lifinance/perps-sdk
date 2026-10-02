import type {
  AccountResponse,
  AccountSummary,
  ActivitiesResponse,
  FillsResponse,
  Order,
  OrdersResponse,
  PositionsResponse,
  Quote,
} from '@lifi/perps-types'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createPerpsClient } from '../client/createPerpsClient.js'
import type { PerpsClientOptions, PerpsConfig } from './api.js'
import type { PerpsBaseConfig } from './config.js'
import type { PerpsProviderPlugin } from './provider.js'

function makeStubProvider(type: string): PerpsProviderPlugin {
  const stub = async (): Promise<never> => {
    throw new Error('not implemented')
  }
  return {
    type,
    bind: () => {},
    getAccount: () => stub() as unknown as Promise<AccountResponse>,
    accountExists: () => stub() as unknown as Promise<boolean>,
    getPositions: () => stub() as unknown as Promise<PositionsResponse>,
    getOrders: () => stub() as unknown as Promise<OrdersResponse>,
    getOrder: () => stub() as unknown as Promise<Order>,
    getFills: () => stub() as unknown as Promise<FillsResponse>,
    getActivity: () => stub() as unknown as Promise<ActivitiesResponse>,
    getQuote: () => stub() as unknown as Promise<Quote>,
    getAccountSummary: () => stub() as unknown as AccountSummary,
    snapOrderPrice: (_market, price) => price,
    snapOrderSize: (_market, size) => size,
    estimateLiquidationPrice: () => undefined,
    positionRemovableMargin: () => undefined,
    getMarketSettings: () => stub(),
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

  it('accepts only the plugin array as providers', () => {
    expectTypeOf<PerpsConfig['providers']>().toEqualTypeOf<
      PerpsProviderPlugin[] | undefined
    >()
    expectTypeOf<PerpsClientOptions['providers']>().toEqualTypeOf<
      PerpsProviderPlugin[] | undefined
    >()
    expectTypeOf<PerpsBaseConfig>().not.toHaveProperty('providers')
  })

  it('has no disableVersionCheck option', () => {
    expectTypeOf<PerpsConfig>().not.toHaveProperty('disableVersionCheck')
    expectTypeOf<PerpsBaseConfig>().not.toHaveProperty('disableVersionCheck')
  })

  it('keeps provider config and the version-check flag off the resolved config', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: [makeStubProvider('hyperliquid')],
    })

    expect(client.config).not.toHaveProperty('providers')
    expect(client.config).not.toHaveProperty('disableVersionCheck')
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
