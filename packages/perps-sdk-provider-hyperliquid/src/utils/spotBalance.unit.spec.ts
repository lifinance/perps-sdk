import { describe, expect, it } from 'vitest'
import type { HlSpotBalance } from '../types/index.js'
import { spotAssetFromToken } from './spotBalance.js'

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
