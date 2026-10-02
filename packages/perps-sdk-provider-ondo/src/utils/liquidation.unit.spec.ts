import { type PerpsMarket, PositionMarginAdjustment } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { estimateLiquidationPrice } from './liquidation.js'

const market = (overrides: Partial<PerpsMarket>): PerpsMarket => ({
  providerId: 'ondo',
  id: 'BTC-USD.P',
  categoryId: 'ondo',
  baseAsset: {
    providerId: 'ondo',
    id: 'BTC',
    displaySymbol: 'BTC',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'ondo',
    id: 'USD',
    displaySymbol: 'USD',
    logoURI: '',
  },
  szDecimals: 4,
  priceDecimals: 1,
  maxLeverage: 20,
  onlyIsolated: true,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
  maintenanceMarginRate: 0.05,
  ...overrides,
})

describe('estimateLiquidationPrice (Ondo)', () => {
  it('estimates a long liquidation from the market maintenance margin rate', () => {
    // entry * (1 - 1/leverage) / (1 - mmr) = 95 * 0.9 / 0.95
    expect(
      estimateLiquidationPrice(market({}), {
        entryPrice: 95,
        leverage: 10,
        isLong: true,
      })
    ).toBe(90)
  })

  it('estimates a short liquidation from the market maintenance margin rate', () => {
    // entry * (1 + 1/leverage) / (1 + mmr) = 105 * 1.1 / 1.05
    expect(
      estimateLiquidationPrice(market({}), {
        entryPrice: 105,
        leverage: 10,
        isLong: false,
      })
    ).toBe(110)
  })

  it('returns undefined when the market carries no maintenanceMarginRate', () => {
    expect(
      estimateLiquidationPrice(market({ maintenanceMarginRate: undefined }), {
        entryPrice: 95,
        leverage: 10,
        isLong: true,
      })
    ).toBeUndefined()
  })
})
