import { PerpsError } from '@lifi/perps-sdk'
import { type Market, PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { findMarket, requireMarket } from './requireMarket.js'

const market: Market = {
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

describe('requireMarket (Hyperliquid)', () => {
  it('projects a found market down to its MarketDisplay fields', () => {
    const byId = new Map<string, Market>([['BTC', market]])

    expect(requireMarket(byId, 'BTC')).toEqual({
      providerId: 'hyperliquid',
      id: 'BTC',
      categoryId: 'hyperliquid',
      baseAsset: market.baseAsset,
      quoteAsset: market.quoteAsset,
    })
  })

  it('throws a MarketNotFound PerpsError tagged with the provider key for an unknown id', () => {
    const byId = new Map<string, Market>([['BTC', market]])

    let thrown: unknown
    try {
      requireMarket(byId, 'DOGE')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(PerpsError)
    const err = thrown as PerpsError
    expect(err.code).toBe(PerpsErrorCode.MarketNotFound)
    expect(err.tool).toBe('hyperliquid')
    expect(err.message).toContain(
      "No Hyperliquid market found for marketId 'DOGE'"
    )
  })
})

describe('findMarket (Hyperliquid)', () => {
  it('projects a found market down to its MarketDisplay fields', () => {
    const byId = new Map<string, Market>([['BTC', market]])

    expect(findMarket(byId, 'BTC')).toEqual({
      providerId: 'hyperliquid',
      id: 'BTC',
      categoryId: 'hyperliquid',
      baseAsset: market.baseAsset,
      quoteAsset: market.quoteAsset,
    })
  })

  it('returns undefined for an unknown id', () => {
    const byId = new Map<string, Market>([['BTC', market]])

    expect(findMarket(byId, 'DOGE')).toBeUndefined()
  })
})
