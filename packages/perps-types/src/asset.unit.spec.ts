import { describe, expect, it } from 'vitest'
import type { Asset, AssetsResponse, DepositAsset } from './asset.js'
import type { Address } from './primitives.js'

const usdc: Asset = {
  providerId: 'lighter',
  id: '0',
  displaySymbol: 'USDC',
  logoURI: 'https://example.com/usdc.png',
}

const eth: Asset = {
  providerId: 'hyperliquid',
  id: 'ETH',
  displaySymbol: 'ETH',
  logoURI: 'https://example.com/eth.png',
  displayName: 'Ethereum',
}

const silver: Asset = {
  providerId: 'hyperliquid',
  id: 'SILVER',
  displaySymbol: 'SILVER',
  logoURI: 'https://example.com/silver.png',
  tags: ['metal', 'commodity'],
  aliases: ['XAG'],
}

const response: AssetsResponse = {
  assets: [usdc, eth],
}

describe('Asset', () => {
  it('carries providerId, own id, displaySymbol and logoURI', () => {
    expect(usdc.providerId).toBe('lighter')
    expect(usdc.id).toBe('0')
    expect(usdc.displaySymbol).toBe('USDC')
    expect(usdc.logoURI).toBe('https://example.com/usdc.png')
  })

  it('admits an optional displayName', () => {
    expect(usdc.displayName).toBeUndefined()
    expect(eth.displayName).toBe('Ethereum')
  })

  it('admits optional tags and aliases', () => {
    expect(usdc.tags).toBeUndefined()
    expect(usdc.aliases).toBeUndefined()
    expect(silver.tags).toEqual(['metal', 'commodity'])
    expect(silver.aliases).toEqual(['XAG'])
  })

  it('carries no collateral flag', () => {
    expect('isMarginCollateral' in usdc).toBe(false)
    expect('marginEligible' in usdc).toBe(false)
  })
})

describe('AssetsResponse', () => {
  it('survives a JSON roundtrip', () => {
    const parsed = JSON.parse(JSON.stringify(response)) as AssetsResponse
    expect(parsed).toEqual(response)
    expect(parsed.assets.map((a) => a.displaySymbol)).toEqual(['USDC', 'ETH'])
  })
})

const arbitrumUsdc: DepositAsset = {
  chainId: 42161,
  address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  decimals: 6,
  displaySymbol: 'USDC',
  logoURI: 'https://example.com/usdc.png',
}

type Expect<T extends true> = T
type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false
type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K
}[keyof T]

// DepositAsset carries full on-chain identity — chain, address, decimals —
// where Asset carries only an opaque provider-native id. `address` reuses the
// `0x${string}` Address brand, not a bare string.
type _DepositAssetAddress = Expect<Equals<DepositAsset['address'], Address>>

// chainId / address / decimals are all required — a DepositAsset without an
// on-chain target is not representable.
type _DepositAssetRequired = Expect<
  Equals<
    Extract<RequiredKeys<DepositAsset>, 'chainId' | 'address' | 'decimals'>,
    'chainId' | 'address' | 'decimals'
  >
>

// displayName is the only optional field (mirrors Asset).
type _DepositAssetDisplayNameOptional = Expect<
  Equals<Extract<RequiredKeys<DepositAsset>, 'displayName'>, never>
>

export type _DepositAssetTypeAssertions = [
  _DepositAssetAddress,
  _DepositAssetRequired,
  _DepositAssetDisplayNameOptional,
]

describe('DepositAsset', () => {
  it('carries on-chain identity distinct from a provider-native Asset id', () => {
    expect(arbitrumUsdc.chainId).toBe(42161)
    expect(arbitrumUsdc.address).toBe(
      '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
    )
    expect(arbitrumUsdc.decimals).toBe(6)
  })

  it('reuses displaySymbol/logoURI for display, displayName optional', () => {
    expect(arbitrumUsdc.displaySymbol).toBe('USDC')
    expect(arbitrumUsdc.logoURI).toBe('https://example.com/usdc.png')
    expect(arbitrumUsdc.displayName).toBeUndefined()
  })

  it('survives a JSON roundtrip', () => {
    const parsed = JSON.parse(JSON.stringify(arbitrumUsdc)) as DepositAsset
    expect(parsed).toEqual(arbitrumUsdc)
  })
})
