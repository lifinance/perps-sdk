import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HlAssetCtx, HlUniverseItem } from '../types/index.js'
import { mapMarket } from './mapMarket.js'

const universe: HlUniverseItem = {
  name: 'BTC',
  szDecimals: 5,
  maxLeverage: 50,
  onlyIsolated: false,
}

const assetCtx: HlAssetCtx = {
  funding: '0.0001',
  openInterest: '1234.5',
  dayNtlVlm: '987654',
  prevDayPx: '94000',
  markPx: '95000',
}

const HOUR_MS = 60 * 60 * 1000

describe('mapMarket (Hyperliquid)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps universe + assetCtx fields onto a PerpsMarket', () => {
    vi.setSystemTime(new Date('2024-01-01T00:30:00Z'))

    const result = mapMarket(universe, assetCtx)

    expect(result.id).toBe('BTC')
    expect(result.categoryId).toBe('hyperliquid')
    expect(result.szDecimals).toBe(5)
    // 6 - szDecimals
    expect(result.priceDecimals).toBe(1)
    // 1 / (2 * maxLeverage)
    expect(result.maintenanceMarginRate).toBeCloseTo(0.01, 9)
    expect(result.markPrice).toBe('95000')
    expect(result.volume24h).toBe('987654')
    expect(result.prevDayPrice).toBe('94000')
    expect(result.maxLeverage).toBe(50)
    expect(result.onlyIsolated).toBe(false)
    expect(result.funding.rate).toBe('0.0001')
    expect(result.openInterest).toBe('1234.5')
  })

  it('rounds nextFundingTime up to the next hour boundary', () => {
    vi.setSystemTime(new Date('2024-01-01T00:30:00Z'))
    const expected = Math.ceil(Date.now() / HOUR_MS) * HOUR_MS

    expect(mapMarket(universe, assetCtx).funding.nextFundingTime).toBe(expected)
    // 00:30 rounds up to 01:00.
    expect(new Date(expected).toISOString()).toBe('2024-01-01T01:00:00.000Z')
  })

  it('keeps nextFundingTime at the boundary when already on the hour', () => {
    vi.setSystemTime(new Date('2024-01-01T02:00:00.000Z'))

    expect(mapMarket(universe, assetCtx).funding.nextFundingTime).toBe(
      Date.parse('2024-01-01T02:00:00.000Z')
    )
  })

  it('coerces a missing onlyIsolated flag to false', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    const { onlyIsolated, ...rest } = universe

    expect(mapMarket(rest as HlUniverseItem, assetCtx).onlyIsolated).toBe(false)
  })
})
