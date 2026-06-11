import { describe, expect, it } from 'vitest'
import type { Asset } from './asset.js'
import type {
  BaseMarket,
  MarketDisplay,
  MarketPrice,
  PerpsMarket,
  SpotMarket,
} from './market.js'

const btc: Asset = {
  providerId: 'hyperliquid',
  id: 'BTC',
  displaySymbol: 'BTC',
  logoURI: 'https://example.com/btc.png',
}

const usdc: Asset = {
  providerId: 'hyperliquid',
  id: 'USDC',
  displaySymbol: 'USDC',
  logoURI: 'https://example.com/usdc.png',
}

const perpsMarket: PerpsMarket = {
  providerId: 'hyperliquid',
  id: 'BTC',
  categoryId: 'hyperliquid',
  baseAsset: btc,
  quoteAsset: usdc,
  szDecimals: 5,
  priceDecimals: 1,
  markPrice: '60000',
  maxLeverage: 50,
  onlyIsolated: false,
  funding: { rate: '0.0001', nextFundingTime: 1_700_000_000_000 },
  openInterest: '1000',
  maintenanceMarginRate: 0.01,
}

const spotMarket: SpotMarket = {
  providerId: 'hyperliquid',
  id: '@142',
  categoryId: 'spot',
  baseAsset: { ...btc, id: 'PURR', displaySymbol: 'PURR' },
  quoteAsset: usdc,
  szDecimals: 2,
  markPrice: '0.5',
}

describe('PerpsMarket', () => {
  it('composes base + quote Assets and carries perps-only fields', () => {
    expect(perpsMarket.baseAsset.displaySymbol).toBe('BTC')
    expect(perpsMarket.quoteAsset.displaySymbol).toBe('USDC')
    expect(perpsMarket.maxLeverage).toBe(50)
    expect(perpsMarket.funding.rate).toBe('0.0001')
  })

  it('optionally carries venue tick and margin metadata', () => {
    expect(perpsMarket.priceDecimals).toBe(1)
    expect(perpsMarket.maintenanceMarginRate).toBe(0.01)
  })
})

describe('SpotMarket', () => {
  it('carries a non-null quote leg and no perps fields', () => {
    expect(spotMarket.quoteAsset.displaySymbol).toBe('USDC')
    expect('maxLeverage' in spotMarket).toBe(false)
    expect('funding' in spotMarket).toBe(false)
  })
})

describe('MarketDisplay', () => {
  it('is the shared subset embedded on Position/Fill/Order', () => {
    const display: MarketDisplay = {
      providerId: perpsMarket.providerId,
      id: perpsMarket.id,
      categoryId: perpsMarket.categoryId,
      baseAsset: perpsMarket.baseAsset,
      quoteAsset: perpsMarket.quoteAsset,
    }
    expect(display.id).toBe('BTC')
    expect(display.baseAsset.id).toBe('BTC')
  })
})

describe('MarketPrice', () => {
  it('references a market by opaque marketId', () => {
    const price: MarketPrice = { marketId: 'BTC', price: '60000' }
    expect(price.marketId).toBe('BTC')
    expect(price.price).toBe('60000')
  })
})

describe('BaseMarket', () => {
  it('survives a JSON roundtrip', () => {
    const base: BaseMarket = perpsMarket
    const parsed = JSON.parse(JSON.stringify(base)) as BaseMarket
    expect(parsed).toEqual(perpsMarket)
  })
})
