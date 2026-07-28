import { type PerpsMarket, PositionMarginAdjustment } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { estimateLiquidationPrice } from './liquidation.js'

// maintenanceMarginRate 0.012 mirrors live Lighter BTC
// (maintenance_margin_fraction 120).
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
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
  funding: { rate: '0.0001', nextFundingTime: 0 },
  maintenanceMarginRate: 0.012,
  ...overrides,
})

describe('estimateLiquidationPrice (Lighter)', () => {
  it('estimates a long liquidation from the market maintenance margin rate', () => {
    // entry * (1 - 1/leverage) / (1 - mmr) = 61729.6 * 0.9 / 0.988
    const liq = estimateLiquidationPrice(market({}), {
      entryPrice: 61729.6,
      leverage: 10,
      isLong: true,
    })
    expect(liq).toBeCloseTo(56231.417, 2)
  })

  it('estimates a short liquidation from the market maintenance margin rate', () => {
    // entry * (1 + 1/leverage) / (1 + mmr) = 61729.6 * 1.1 / 1.012
    const liq = estimateLiquidationPrice(market({}), {
      entryPrice: 61729.6,
      leverage: 10,
      isLong: false,
    })
    expect(liq).toBeCloseTo(67097.391, 2)
  })

  it('returns undefined when the market carries no maintenanceMarginRate', () => {
    const bare = market({ maintenanceMarginRate: undefined })
    expect(
      estimateLiquidationPrice(bare, {
        entryPrice: 61729.6,
        leverage: 10,
        isLong: true,
      })
    ).toBeUndefined()
  })

  it('returns undefined for zero leverage', () => {
    expect(
      estimateLiquidationPrice(market({}), {
        entryPrice: 61729.6,
        leverage: 0,
        isLong: true,
      })
    ).toBeUndefined()
  })
})
