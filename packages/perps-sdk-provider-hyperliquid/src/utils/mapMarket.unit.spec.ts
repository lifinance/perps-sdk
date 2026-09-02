import { PositionMarginAdjustment } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { HlMaxMarketOrderNtls, HlUniverseItem } from '../types/index.js'
import { mapMarket } from './mapMarket.js'

const universe: HlUniverseItem = {
  name: 'BTC',
  szDecimals: 5,
  maxLeverage: 50,
  onlyIsolated: false,
}

const maxMarketOrderNtls: HlMaxMarketOrderNtls = [
  [25, '30000000.0'],
  [20, '5000000.0'],
  [10, '2000000.0'],
  [1, '500000.0'],
]

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
    expect(result.positionMarginAdjustment).toBe(
      PositionMarginAdjustment.ADD_AND_REMOVE
    )
  })

  it('maps the matching market-order tier and documented limit-order multiple', () => {
    const result = mapMarket(universe, 'hyperliquid', maxMarketOrderNtls)

    expect(result.maxMarketOrderUsd).toBe('30000000.0')
    expect(result.maxLimitOrderUsd).toBe('300000000')
  })

  it('maps the lowest market-order tier for low-leverage markets', () => {
    const result = mapMarket(
      { ...universe, maxLeverage: 3 },
      'hyperliquid',
      maxMarketOrderNtls
    )

    expect(result.maxMarketOrderUsd).toBe('500000.0')
    expect(result.maxLimitOrderUsd).toBe('5000000')
  })

  it('leaves order caps unset when the info response is unavailable', () => {
    const result = mapMarket(universe, 'hyperliquid')

    expect(result.maxMarketOrderUsd).toBeUndefined()
    expect(result.maxLimitOrderUsd).toBeUndefined()
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

  it.each([
    ['strictIsolated', PositionMarginAdjustment.ADD_ONLY],
    ['noCross', PositionMarginAdjustment.ADD_AND_REMOVE],
  ] as const)('maps %s without flattening its transfer capability', (mode, expected) => {
    const result = mapMarket({ ...universe, marginMode: mode }, 'hyperliquid')

    expect(result.onlyIsolated).toBe(true)
    expect(result.positionMarginAdjustment).toBe(expected)
  })

  it('fails closed for the ambiguous deprecated onlyIsolated flag', () => {
    const result = mapMarket({ ...universe, onlyIsolated: true }, 'hyperliquid')

    expect(result.positionMarginAdjustment).toBe(
      PositionMarginAdjustment.ADD_ONLY
    )
  })

  it('coerces a missing onlyIsolated flag to false', () => {
    const { onlyIsolated, ...rest } = universe

    expect(mapMarket(rest as HlUniverseItem, 'hyperliquid').onlyIsolated).toBe(
      false
    )
  })
})
