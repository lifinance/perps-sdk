import { describe, expect, it, vi } from 'vitest'
import { hyperliquidProvider } from './HyperliquidProvider.js'

const ADDRESS = '0x1111111111111111111111111111111111111111' as const
const ARBITRUM_USDC = {
  chainId: 42161,
  address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const,
  symbol: 'USDC',
  decimals: 6,
}
const ETHEREUM_USDC = {
  chainId: 1,
  address: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const,
  symbol: 'USDC',
  decimals: 6,
}

describe('hyperliquidProvider.getDepositMethods', () => {
  it('returns the provider bridge for Arbitrum USDC and preserves account state', async () => {
    const provider = hyperliquidProvider()
    provider.accountExists = vi.fn().mockResolvedValue(false)

    const [method] = await provider.getDepositMethods!({
      address: ADDRESS,
      sourceAsset: ARBITRUM_USDC,
    })

    expect(method).toMatchObject({
      kind: 'providerBridge',
      accountState: 'missing',
      sourceAsset: ARBITRUM_USDC,
      destinationAsset: ARBITRUM_USDC,
    })
    expect(provider.accountExists).toHaveBeenCalledWith({ address: ADDRESS })
  })

  it('uses a general LI.FI route for non-Arbitrum source assets', async () => {
    const provider = hyperliquidProvider()
    provider.accountExists = vi.fn().mockResolvedValue(true)

    const [method] = await provider.getDepositMethods!({
      address: ADDRESS,
      sourceAsset: ETHEREUM_USDC,
    })

    expect(method).toMatchObject({
      kind: 'lifiRoute',
      accountState: 'existing',
      sourceAsset: ETHEREUM_USDC,
      destinationAsset: ARBITRUM_USDC,
    })
  })
})
