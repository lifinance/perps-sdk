import type {
  DepositMethod,
  ProviderGetDepositMethodsParams,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { PerpsError } from '../errors/PerpsError.js'
import type { PerpsProviderPlugin } from '../types/provider.js'
import { PerpsClient } from './PerpsClient.js'

const ADDRESS = '0x1111111111111111111111111111111111111111' as Address
const SOURCE_ASSET = {
  chainId: 1,
  address: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const,
  symbol: 'USDC',
  decimals: 6,
}

const baseProvider = (type: string): PerpsProviderPlugin =>
  ({
    type,
    bind: vi.fn(),
    getAccount: vi.fn(),
    accountExists: vi.fn(),
    getPositions: vi.fn(),
    getOrders: vi.fn(),
    getOrder: vi.fn(),
    getFills: vi.fn(),
    getActivity: vi.fn(),
    getQuote: vi.fn(),
    getAccountSummary: vi.fn(),
    formatOrderPrice: vi.fn(),
    formatOrderSize: vi.fn(),
    estimateLiquidationPrice: vi.fn(),
    projectConfig: vi.fn(),
  }) as unknown as PerpsProviderPlugin

describe('PerpsClient.getProviderDepositMethods', () => {
  it('dispatches the selected source asset to an optional provider method', async () => {
    const method: DepositMethod = {
      kind: 'rawTransfer',
      accountState: 'existing',
      sourceAsset: SOURCE_ASSET,
    }
    const plugin = {
      ...baseProvider('test'),
      getDepositMethods: vi
        .fn<
          (params: ProviderGetDepositMethodsParams) => Promise<DepositMethod[]>
        >()
        .mockResolvedValue([method]),
    }
    const client = new PerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: [plugin],
    })

    await expect(
      client.getProviderDepositMethods('test', ADDRESS, SOURCE_ASSET)
    ).resolves.toEqual([method])
    expect(plugin.getDepositMethods).toHaveBeenCalledWith({
      address: ADDRESS,
      sourceAsset: SOURCE_ASSET,
    })
  })

  it('returns an empty list when the registered provider omits discovery', async () => {
    const client = new PerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: [baseProvider('test')],
    })

    await expect(
      client.getProviderDepositMethods('test', ADDRESS, SOURCE_ASSET)
    ).resolves.toEqual([])
  })

  it('rejects unsupported providers instead of applying core provider-key rules', async () => {
    const client = new PerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
    })

    await expect(
      client.getProviderDepositMethods('missing', ADDRESS, SOURCE_ASSET)
    ).rejects.toBeInstanceOf(PerpsError)
  })
})
