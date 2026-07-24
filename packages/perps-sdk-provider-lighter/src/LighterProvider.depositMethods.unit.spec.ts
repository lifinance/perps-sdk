import { describe, expect, it, vi } from 'vitest'
import { lighterProvider } from './LighterProvider.js'

const ADDRESS = '0x1111111111111111111111111111111111111111' as const
const ETHEREUM_USDC = {
  chainId: 1,
  address: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const,
  symbol: 'USDC',
  decimals: 6,
}
const ARBITRUM_USDC = {
  chainId: 42161,
  address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const,
  symbol: 'USDC',
  decimals: 6,
}

describe('lighterProvider.getDepositMethods', () => {
  it('returns one provider bridge with internal approve/deposit legs for a missing account', async () => {
    const provider = lighterProvider()
    provider.accountExists = vi.fn().mockResolvedValue(false)

    const [method] = await provider.getDepositMethods!({
      address: ADDRESS,
      sourceAsset: ETHEREUM_USDC,
    })

    expect(method).toMatchObject({
      kind: 'providerBridge',
      accountState: 'missing',
      sourceAsset: ETHEREUM_USDC,
      destinationAsset: ETHEREUM_USDC,
      providerAction: {
        action: 'deposit',
        legs: [
          { action: 'deposit', title: 'Approve USDC' },
          { action: 'deposit', title: 'Deposit USDC' },
        ],
      },
    })
    expect(method.prerequisites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'gas',
          asset: expect.objectContaining({ chainId: 1 }),
        }),
      ])
    )
  })

  it('describes optional LI.FI funding when the missing-account source is not Ethereum USDC', async () => {
    const provider = lighterProvider()
    provider.accountExists = vi.fn().mockResolvedValue(false)

    const [method] = await provider.getDepositMethods!({
      address: ADDRESS,
      sourceAsset: ARBITRUM_USDC,
    })

    expect(method.prerequisites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'funding', optional: true }),
        expect.objectContaining({ kind: 'gas' }),
      ])
    )
  })

  it('returns the subsequent LI.FI route when the account exists', async () => {
    const provider = lighterProvider()
    provider.accountExists = vi.fn().mockResolvedValue(true)

    const [method] = await provider.getDepositMethods!({
      address: ADDRESS,
      sourceAsset: ARBITRUM_USDC,
    })

    expect(method).toMatchObject({
      kind: 'lifiRoute',
      accountState: 'existing',
      sourceAsset: ARBITRUM_USDC,
      destinationAsset: ETHEREUM_USDC,
    })
    expect(method.providerAction).toBeUndefined()
  })
})
