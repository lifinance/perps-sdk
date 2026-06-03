import type {
  AccountResponse,
  ActivitiesResponse,
  FillsResponse,
  Order,
  OrdersResponse,
  PositionsResponse,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import type { PerpsProviderPlugin, PerpsSDKClient } from '../types/core.js'
import { bindProvider } from './bindProvider.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const fakeClient = { config: { integrator: 'test-app' } } as PerpsSDKClient

type LighterLikePlugin = PerpsProviderPlugin & {
  resolveAuthToken(address: Address): Promise<string | undefined>
}

const makePlugin = () => {
  const calls = {
    getAccount: vi.fn(
      async (): Promise<AccountResponse> => ({}) as AccountResponse
    ),
    getPositions: vi.fn(
      async (): Promise<PositionsResponse> => ({}) as PositionsResponse
    ),
    getOrders: vi.fn(
      async (): Promise<OrdersResponse> => ({}) as OrdersResponse
    ),
    getOrder: vi.fn(async (): Promise<Order> => ({}) as Order),
    getFills: vi.fn(async (): Promise<FillsResponse> => ({}) as FillsResponse),
    getActivity: vi.fn(
      async (): Promise<ActivitiesResponse> => ({}) as ActivitiesResponse
    ),
    resolveAuthToken: vi.fn(async (): Promise<string | undefined> => 'token'),
    projectConfig: vi.fn(() => []),
  }
  const plugin: LighterLikePlugin = {
    type: 'lighter',
    getAccount: calls.getAccount,
    getPositions: calls.getPositions,
    getOrders: calls.getOrders,
    getOrder: calls.getOrder,
    getFills: calls.getFills,
    getActivity: calls.getActivity,
    projectConfig: calls.projectConfig,
    resolveAuthToken: calls.resolveAuthToken,
  }
  return { plugin, calls }
}

describe('bindProvider', () => {
  it('preserves the provider type', () => {
    const { plugin } = makePlugin()
    expect(bindProvider(plugin, fakeClient).type).toBe('lighter')
  })

  it('binds the client into each read method, so callers omit it', async () => {
    const { plugin, calls } = makePlugin()
    const bound = bindProvider(plugin, fakeClient)

    await bound.getAccount({ address: ADDRESS })
    await bound.getPositions({ address: ADDRESS, marketId: 'ETH' })
    await bound.getOrders({ address: ADDRESS })
    await bound.getOrder({ address: ADDRESS, id: '1' })
    await bound.getFills({ address: ADDRESS })
    await bound.getActivity({ address: ADDRESS })

    expect(calls.getAccount).toHaveBeenCalledWith(
      fakeClient,
      { address: ADDRESS },
      undefined
    )
    expect(calls.getPositions).toHaveBeenCalledWith(
      fakeClient,
      { address: ADDRESS, marketId: 'ETH' },
      undefined
    )
    expect(calls.getOrders).toHaveBeenCalledWith(
      fakeClient,
      { address: ADDRESS },
      undefined
    )
    expect(calls.getOrder).toHaveBeenCalledWith(
      fakeClient,
      { address: ADDRESS, id: '1' },
      undefined
    )
    expect(calls.getFills).toHaveBeenCalledWith(
      fakeClient,
      { address: ADDRESS },
      undefined
    )
    expect(calls.getActivity).toHaveBeenCalledWith(
      fakeClient,
      { address: ADDRESS },
      undefined
    )
  })

  it('forwards per-call options to the underlying read method', async () => {
    const { plugin, calls } = makePlugin()
    const bound = bindProvider(plugin, fakeClient)
    const controller = new AbortController()

    await bound.getOrders({ address: ADDRESS }, { signal: controller.signal })

    expect(calls.getOrders).toHaveBeenCalledWith(
      fakeClient,
      { address: ADDRESS },
      { signal: controller.signal }
    )
  })

  it('passes provider-specific extras through unchanged', async () => {
    const { plugin, calls } = makePlugin()
    const bound = bindProvider(plugin, fakeClient) as LighterLikePlugin

    expect(bound.resolveAuthToken).toBe(calls.resolveAuthToken)
    await expect(bound.resolveAuthToken(ADDRESS)).resolves.toBe('token')
    expect(calls.resolveAuthToken).toHaveBeenCalledWith(ADDRESS)
  })

  it('passes non-read core members (projectConfig) through unchanged', () => {
    const { plugin, calls } = makePlugin()
    const bound = bindProvider(plugin, fakeClient)

    expect(bound.projectConfig).toBe(calls.projectConfig)
  })
})
