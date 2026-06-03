import type { Market } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { marketDisplayFromCoin } from './deriveMarket.js'
import { marketToDisplay, resolveEntityMarket } from './resolveEntityMarket.js'

const BTC_PERP: Market = {
  providerId: 'hyperliquid',
  id: 'BTC',
  categoryId: 'hyperliquid',
  baseAsset: {
    providerId: 'hyperliquid',
    id: 'BTC',
    displaySymbol: 'BTC',
    logoURI: 'https://app.hyperliquid.xyz/coins/BTC.svg',
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: 'https://app.hyperliquid.xyz/coins/USDC.svg',
  },
} as Market

const BTC_SPOT: Market = {
  providerId: 'hyperliquid',
  id: '@142',
  categoryId: 'spot',
  baseAsset: {
    providerId: 'hyperliquid',
    id: 'BTC',
    displaySymbol: 'BTC/USDC',
    logoURI: 'https://app.hyperliquid.xyz/coins/BTC_spot.svg',
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: 'https://app.hyperliquid.xyz/coins/USDC.svg',
  },
} as Market

const byMarketId = new Map<string, Market>([
  [BTC_PERP.id, BTC_PERP],
  [BTC_SPOT.id, BTC_SPOT],
])

describe('resolveEntityMarket (Hyperliquid)', () => {
  it('re-keys a spot entity onto the backend BASE/QUOTE display and spot logo', () => {
    const entity = { market: marketDisplayFromCoin('@142'), foo: 1 }

    // The synthesised display is malformed for spot.
    expect(entity.market.baseAsset.displaySymbol).toBe('@142')

    const resolved = resolveEntityMarket(entity, byMarketId)

    expect(resolved.market.baseAsset.displaySymbol).toBe('BTC/USDC')
    expect(resolved.market.baseAsset.logoURI).toBe(
      'https://app.hyperliquid.xyz/coins/BTC_spot.svg'
    )
    expect(resolved.market.categoryId).toBe('spot')
    expect(resolved.foo).toBe(1)
  })

  it('replaces a perp entity display with the listed market (unchanged symbol)', () => {
    const entity = { market: marketDisplayFromCoin('BTC') }

    const resolved = resolveEntityMarket(entity, byMarketId)

    expect(resolved.market).toEqual(marketToDisplay(BTC_PERP))
    expect(resolved.market.baseAsset.displaySymbol).toBe('BTC')
  })

  it('falls back to the synthesised display for an unlisted market', () => {
    const entity = { market: marketDisplayFromCoin('DOGE') }

    const resolved = resolveEntityMarket(entity, byMarketId)

    expect(resolved).toBe(entity)
    expect(resolved.market.baseAsset.displaySymbol).toBe('DOGE')
  })
})
