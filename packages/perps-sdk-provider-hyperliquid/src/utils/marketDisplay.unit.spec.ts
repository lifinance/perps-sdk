import type { Market } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { coinAsset, perpsDexNames } from './marketDisplay.js'

describe('coinAsset', () => {
  it('keeps the raw coin for id and logoURI', () => {
    expect(coinAsset('xyz:BRENTOIL')).toEqual({
      providerId: 'hyperliquid',
      id: 'xyz:BRENTOIL',
      displaySymbol: 'BRENTOIL',
      logoURI: 'https://app.hyperliquid.xyz/coins/xyz:BRENTOIL.svg',
    })
  })

  it('strips the HIP-3 dex prefix from displaySymbol only', () => {
    expect(coinAsset('xyz:PURR').displaySymbol).toBe('PURR')
    expect(coinAsset('flv:HYPE').displaySymbol).toBe('HYPE')
  })

  it('leaves main-dex coins untouched', () => {
    expect(coinAsset('BTC')).toEqual({
      providerId: 'hyperliquid',
      id: 'BTC',
      displaySymbol: 'BTC',
      logoURI: 'https://app.hyperliquid.xyz/coins/BTC.svg',
    })
  })

  it('applies the logo override while keeping id from the bare coin', () => {
    expect(coinAsset('HYPE')).toEqual({
      providerId: 'hyperliquid',
      id: 'HYPE',
      displaySymbol: 'HYPE',
      logoURI:
        'https://static.debank.com/image/hyper_token/logo_url/hyper/0b3e288cfe418e9ce69eef4c96374583.png',
    })
    expect(coinAsset('USDC').logoURI).toBe(
      'https://app.hyperliquid.xyz/coins/USDC.svg'
    )
  })
})

describe('perpsDexNames', () => {
  const market = (id: string, categoryId: string): Market =>
    ({ id, categoryId }) as Market

  it('maps the main dex to the empty wire name and excludes spot', () => {
    const markets = [
      market('BTC', 'hyperliquid'),
      market('ETH', 'hyperliquid'),
      market('xyz:BRENTOIL', 'xyz'),
      market('flv:HYPE', 'flv'),
      market('@142', 'spot'),
    ]
    expect(perpsDexNames(markets)).toEqual(['', 'xyz', 'flv'])
  })
})
