import type { Asset } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { HlSpotBalance } from '../types/index.js'
import { spotAssetFromToken, spotBalance } from './spotBalance.js'

const balance = (coin: string, token: number): HlSpotBalance => ({
  coin,
  token,
  total: '0',
  hold: '0',
  entryNtl: '0',
})

describe('spotAssetFromToken', () => {
  it('uses the token index as id and the override-aware spot logo', () => {
    expect(spotAssetFromToken(balance('USDE', 42))).toEqual({
      providerId: 'hyperliquid',
      id: '42',
      displaySymbol: 'USDE',
      logoURI: 'https://app.hyperliquid.xyz/coins/USDE_spot.svg',
    })
  })

  it('applies the override table on the balance path', () => {
    expect(spotAssetFromToken(balance('USDC', 0)).logoURI).toBe(
      'https://app.hyperliquid.xyz/coins/USDC.svg'
    )
    expect(spotAssetFromToken(balance('USDT0', 268)).logoURI).toBe(
      'https://app.hyperliquid.xyz/coins/USDT.svg'
    )
  })

  it('degrades a Unit-bridged balance to the base _spot rule (no fullName)', () => {
    expect(spotAssetFromToken(balance('UBTC', 197)).logoURI).toBe(
      'https://app.hyperliquid.xyz/coins/UBTC_spot.svg'
    )
  })
})

describe('spotBalance', () => {
  const asset: Asset = {
    providerId: 'hyperliquid',
    id: '150',
    displaySymbol: 'HYPE',
  }

  it('carries the unit price beside the USD value', () => {
    expect(spotBalance(asset, '2', new Map([['150', 37.5]]))).toEqual({
      categoryId: 'spot',
      asset,
      units: '2',
      valueUsd: '75',
      price: '37.5',
    })
  })

  it('omits the price when the map holds no mark for the asset', () => {
    const result = spotBalance(asset, '2', new Map())
    expect(result.price).toBeUndefined()
    expect(result.valueUsd).toBe('0')
  })
})
