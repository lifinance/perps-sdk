import type {
  AccountResponse,
  ActivitiesResponse,
  Asset,
  AssetsResponse,
  FillsResponse,
  OhlcvResponse,
  Order,
  OrderbookResponse,
  OrdersResponse,
  PositionsResponse,
  PricesResponse,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { createPerpsClient } from '../client/createPerpsClient.js'
import type { PerpsProvider } from './core.js'

function makeStubProvider(type: string): PerpsProvider {
  const stub = async (): Promise<never> => {
    throw new Error('not implemented')
  }
  return {
    type,
    getAccount: () => stub() as unknown as Promise<AccountResponse>,
    getPositions: () => stub() as unknown as Promise<PositionsResponse>,
    getOrders: () => stub() as unknown as Promise<OrdersResponse>,
    getOrder: () => stub() as unknown as Promise<Order>,
    getFills: () => stub() as unknown as Promise<FillsResponse>,
    getActivity: () => stub() as unknown as Promise<ActivitiesResponse>,
    getAsset: () => stub() as unknown as Promise<Asset>,
    getAssets: () => stub() as unknown as Promise<AssetsResponse>,
    getPrices: () => stub() as unknown as Promise<PricesResponse>,
    getOhlcv: () => stub() as unknown as Promise<OhlcvResponse>,
    getOrderbook: () => stub() as unknown as Promise<OrderbookResponse>,
  }
}

describe('PerpsProvider integration with createPerpsClient', () => {
  it('exposes registered providers via client.providers in registration order', () => {
    const hl = makeStubProvider('hyperliquid')
    const lighter = makeStubProvider('lighter')
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: [hl, lighter],
    })

    expect(client.providers).toEqual([hl, lighter])
  })

  it('looks providers up by type via getProvider', () => {
    const hl = makeStubProvider('hyperliquid')
    const lighter = makeStubProvider('lighter')
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: [hl, lighter],
    })

    expect(client.getProvider('hyperliquid')).toBe(hl)
    expect(client.getProvider('lighter')).toBe(lighter)
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

  it('lets a registered provider receive the client back through method calls', async () => {
    const provider: PerpsProvider = {
      ...makeStubProvider('hyperliquid'),
      getAccount: async (sdkClient, params) => {
        expect(sdkClient.config.integrator).toBe('test-app')
        return {
          balances: [],
          totalEquity: '0',
          marginUsed: '0',
          marginAvailable: '0',
          config: { provider: 'hyperliquid' },
          extra: { address: params.address },
        } as unknown as AccountResponse
      },
    }
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: [provider],
    })

    const result = await client.getProvider('hyperliquid')!.getAccount(client, {
      address: '0x0000000000000000000000000000000000000000',
    })

    expect(result).toBeDefined()
  })
})
