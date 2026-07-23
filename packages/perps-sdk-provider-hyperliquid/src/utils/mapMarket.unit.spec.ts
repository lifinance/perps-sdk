import { describe, expect, it } from 'vitest'
import type { HlUniverseItem } from '../types/index.js'
import { mapMarket } from './mapMarket.js'

const universe: HlUniverseItem = {
  name: 'BTC',
  szDecimals: 5,
  maxLeverage: 50,
  onlyIsolated: false,
}

describe('mapMarket (Hyperliquid)', () => {
  it('maps universe fields onto a PerpsMarket', () => {
    const result = mapMarket(universe, 'hyperliquid')

    expect(result.id).toBe('BTC')
    expect(result.categoryId).toBe('hyperliquid')
    expect(result.szDecimals).toBe(5)
    // 6 - szDecimals
    expect(result.priceDecimals).toBe(1)
    // 1 / (2 * maxLeverage)
    expect(result.maintenanceMarginRate).toBeCloseTo(0.01, 9)
    expect(result.maxLeverage).toBe(50)
    expect(result.onlyIsolated).toBe(false)
  })

  it('carries the explicit delisted status', () => {
    expect(
      mapMarket({ ...universe, isDelisted: true }, 'hyperliquid').isDelisted
    ).toBe(true)
    expect(mapMarket(universe, 'hyperliquid').isDelisted).toBeUndefined()
  })

  it('carries no live mark/stats fields', () => {
    const result = mapMarket(universe, 'hyperliquid')

    expect('markPrice' in result).toBe(false)
    expect('volume24h' in result).toBe(false)
    expect('prevDayPrice' in result).toBe(false)
    expect('funding' in result).toBe(false)
    expect('openInterest' in result).toBe(false)
  })

  it('coerces a missing onlyIsolated flag to false', () => {
    const { onlyIsolated, ...rest } = universe

    expect(mapMarket(rest as HlUniverseItem, 'hyperliquid').onlyIsolated).toBe(
      false
    )
  })
})
