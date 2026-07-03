import { PerpsError } from '@lifi/perps-sdk'
import { type Market, PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { formatOrderPrice, formatOrderSize } from './orderFormatting.js'

const marketFixture = (overrides?: Partial<Market>): Market => ({
  providerId: 'ondo',
  id: 'AAPL-USD.P',
  categoryId: 'ondo',
  baseAsset: {
    providerId: 'ondo',
    id: 'AAPL',
    displaySymbol: 'AAPL',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'ondo',
    id: 'USD',
    displaySymbol: 'USD',
    logoURI: '',
  },
  szDecimals: 2,
  priceDecimals: 2,
  markPrice: '201.5',
  maxLeverage: 10,
  onlyIsolated: false,
  funding: { rate: '0.0001', nextFundingTime: 0 },
  ...overrides,
})

describe('formatOrderPrice', () => {
  it('rounds half-up onto the market priceDecimals grid', () => {
    const market = marketFixture()
    expect(formatOrderPrice(market, 201.555)).toBe('201.56')
    expect(formatOrderPrice(market, 201.554)).toBe('201.55')
  })

  it('strips trailing zeros', () => {
    expect(formatOrderPrice(marketFixture(), 201.5)).toBe('201.5')
    expect(formatOrderPrice(marketFixture(), 200)).toBe('200')
  })

  it('formats a zero price as "0"', () => {
    expect(formatOrderPrice(marketFixture(), 0)).toBe('0')
  })

  it('throws ValidationError when the market carries no priceDecimals', () => {
    const market = marketFixture({ priceDecimals: undefined })
    expect(() => formatOrderPrice(market, 201.5)).toThrowError(PerpsError)
    expect(() => formatOrderPrice(market, 201.5)).toThrowError(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})

describe('formatOrderSize', () => {
  it('truncates toward zero onto the market szDecimals grid', () => {
    const market = marketFixture()
    // Never rounds up: the size must not exceed the user's balance.
    expect(formatOrderSize(market, 0.129)).toBe('0.12')
    expect(formatOrderSize(market, 1.999)).toBe('1.99')
  })

  it('strips trailing zeros', () => {
    expect(formatOrderSize(marketFixture(), 1.5)).toBe('1.5')
    expect(formatOrderSize(marketFixture(), 3)).toBe('3')
  })

  it('formats a dust size as "0"', () => {
    expect(formatOrderSize(marketFixture(), 0.001)).toBe('0')
  })
})
