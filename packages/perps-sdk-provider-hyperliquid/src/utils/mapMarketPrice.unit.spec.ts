import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HlAssetCtx } from '../types/index.js'
import { mapMarketPrice } from './mapMarketPrice.js'

const assetCtx: HlAssetCtx = {
  funding: '0.0001',
  openInterest: '1234.5',
  dayNtlVlm: '987654',
  prevDayPx: '94000',
  markPx: '95000',
}

const HOUR_MS = 60 * 60 * 1000

describe('mapMarketPrice (Hyperliquid)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps the mid plus assetCtx fields onto a MarketPrice', () => {
    vi.setSystemTime(new Date('2024-01-01T00:30:00Z'))

    const result = mapMarketPrice('BTC', assetCtx, '95001')

    expect(result.marketId).toBe('BTC')
    expect(result.price).toBe('95001')
    expect(result.markPrice).toBe('95000')
    expect(result.volume24h).toBe('987654')
    expect(result.prevDayPrice).toBe('94000')
    expect(result.openInterest).toBe('1234.5')
    expect(result.funding?.rate).toBe('0.0001')
  })

  it('rounds nextFundingTime up to the next hour boundary', () => {
    vi.setSystemTime(new Date('2024-01-01T00:30:00Z'))
    const expected = Math.ceil(Date.now() / HOUR_MS) * HOUR_MS

    expect(
      mapMarketPrice('BTC', assetCtx, '95001').funding?.nextFundingTime
    ).toBe(expected)
    // 00:30 rounds up to 01:00.
    expect(new Date(expected).toISOString()).toBe('2024-01-01T01:00:00.000Z')
  })

  it('keeps nextFundingTime at the boundary when already on the hour', () => {
    vi.setSystemTime(new Date('2024-01-01T02:00:00.000Z'))

    expect(
      mapMarketPrice('BTC', assetCtx, '95001').funding?.nextFundingTime
    ).toBe(Date.parse('2024-01-01T02:00:00.000Z'))
  })
})
