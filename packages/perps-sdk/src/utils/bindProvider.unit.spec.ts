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
    bind: vi.fn((_client: PerpsSDKClient): void => {}),
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
    bind: calls.bind,
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

  it('injects the client into the plugin once via bind', () => {
    const { plugin, calls } = makePlugin()
    bindProvider(plugin, fakeClient)

    expect(calls.bind).toHaveBeenCalledTimes(1)
    expect(calls.bind).toHaveBeenCalledWith(fakeClient)
  })

  it('drops the one-shot bind member from the bound provider', () => {
    const { plugin } = makePlugin()
    const bound = bindProvider(plugin, fakeClient)

    expect('bind' in bound).toBe(false)
  })

  it('forwards clientless read calls straight through to the plugin', async () => {
    const { plugin, calls } = makePlugin()
    const bound = bindProvider(plugin, fakeClient)

    await bound.getAccount({ address: ADDRESS })
    await bound.getPositions({ address: ADDRESS, marketId: 'ETH' })
    await bound.getOrders({ address: ADDRESS })
    await bound.getOrder({ address: ADDRESS, id: '1' })
    await bound.getFills({ address: ADDRESS })
    await bound.getActivity({ address: ADDRESS })

    expect(calls.getAccount).toHaveBeenCalledWith({ address: ADDRESS })
    expect(calls.getPositions).toHaveBeenCalledWith({
      address: ADDRESS,
      marketId: 'ETH',
    })
    expect(calls.getOrders).toHaveBeenCalledWith({ address: ADDRESS })
    expect(calls.getOrder).toHaveBeenCalledWith({ address: ADDRESS, id: '1' })
    expect(calls.getFills).toHaveBeenCalledWith({ address: ADDRESS })
    expect(calls.getActivity).toHaveBeenCalledWith({ address: ADDRESS })
  })

  it('forwards per-call options to the underlying read method', async () => {
    const { plugin, calls } = makePlugin()
    const bound = bindProvider(plugin, fakeClient)
    const controller = new AbortController()

    await bound.getOrders({ address: ADDRESS }, { signal: controller.signal })

    expect(calls.getOrders).toHaveBeenCalledWith(
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
