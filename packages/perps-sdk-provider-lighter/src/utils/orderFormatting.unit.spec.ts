import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode, type PerpsMarket } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { formatOrderPrice, formatOrderSize } from './orderFormatting.js'

// Decimal budgets mirror live Lighter orderBookDetails:
// BTC: supported_price_decimals 1, supported_size_decimals 5
// DOGE: supported_price_decimals 6, supported_size_decimals 0
const market = (overrides: Partial<PerpsMarket>): PerpsMarket => ({
  providerId: 'lighter',
  id: '1',
  categoryId: 'lighter',
  baseAsset: {
    providerId: 'lighter',
    id: '1',
    displaySymbol: 'BTC',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'lighter',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: '',
  },
  szDecimals: 5,
  priceDecimals: 1,
  markPrice: '61729.6',
  maxLeverage: 50,
  onlyIsolated: false,
  funding: { rate: '0.0001', nextFundingTime: 0 },
  ...overrides,
})

const btc = market({})
const doge = market({
  id: '3',
  szDecimals: 0,
  priceDecimals: 6,
  markPrice: '0.123456',
})

describe('formatOrderPrice (Lighter)', () => {
  it('rounds onto the market tick grid', () => {
    expect(formatOrderPrice(btc, 61729.64)).toBe('61729.6')
    expect(formatOrderPrice(btc, 61729.66)).toBe('61729.7')
  })

  it('keeps prices with more than 5 significant figures intact', () => {
    expect(formatOrderPrice(btc, 61729.6)).toBe('61729.6')
  })

  it('uses the full decimal budget on high-precision markets', () => {
    expect(formatOrderPrice(doge, 0.1234564)).toBe('0.123456')
    expect(formatOrderPrice(doge, 0.1234567)).toBe('0.123457')
  })

  it('removes trailing zeros', () => {
    expect(formatOrderPrice(doge, 0.1)).toBe('0.1')
    expect(formatOrderPrice(btc, 61730)).toBe('61730')
  })

  it('throws ValidationError when the market carries no priceDecimals', () => {
    const bare = market({ priceDecimals: undefined })
    try {
      formatOrderPrice(bare, 61729.6)
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(PerpsError)
      expect((error as PerpsError).code).toBe(PerpsErrorCode.ValidationError)
    }
  })
})

describe('formatOrderSize (Lighter)', () => {
  it('truncates to the market lot grid (never rounds up)', () => {
    expect(formatOrderSize(btc, 0.000209)).toBe('0.0002')
    expect(formatOrderSize(doge, 12.9)).toBe('12')
  })

  it('removes trailing zeros', () => {
    expect(formatOrderSize(btc, 1.5)).toBe('1.5')
    expect(formatOrderSize(btc, 2)).toBe('2')
  })

  it('does not shave a lot off binary float artifacts', () => {
    expect(formatOrderSize(market({ szDecimals: 1 }), 8.2)).toBe('8.2')
    expect(formatOrderSize(market({ szDecimals: 2 }), 0.1 + 0.2)).toBe('0.3')
  })

  it('returns zero for zero size', () => {
    expect(formatOrderSize(btc, 0)).toBe('0')
  })

  it('handles sizes whose string form is exponential', () => {
    expect(formatOrderSize(btc, 2e-8)).toBe('0')
  })
})
