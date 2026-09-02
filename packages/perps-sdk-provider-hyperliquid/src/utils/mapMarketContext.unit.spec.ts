import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HlWsPerpAssetCtx } from '../types/index.js'
import { mapMarketContext } from './mapMarketContext.js'

const ctx: HlWsPerpAssetCtx = {
  coin: 'BTC',
  funding: '0.0001',
  openInterest: '1234.5',
  dayNtlVlm: '987654',
  prevDayPx: '94000',
  markPx: '95000',
  midPx: '95001',
  oraclePx: '94998',
}

const HOUR_MS = 60 * 60 * 1000

describe('mapMarketContext (Hyperliquid)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps the asset context onto a MarketContext', () => {
    vi.setSystemTime(new Date('2024-01-01T00:30:00Z'))

    const result = mapMarketContext('BTC', ctx)

    expect(result.marketId).toBe('BTC')
    expect(result.midPrice).toBe('95001')
    expect(result.markPrice).toBe('95000')
    expect(result.oraclePrice).toBe('94998')
    expect(result.volume24h).toBe('987654')
    expect(result.prevDayPrice).toBe('94000')
    expect(result.openInterest).toBe('1234.5')
    expect(result.funding?.rate).toBe('0.0001')
    expect(result.volumeByTimeframe).toBeUndefined()
  })

  it('falls back to mark when the book is empty (midPx null)', () => {
    vi.setSystemTime(new Date('2024-01-01T00:30:00Z'))

    const result = mapMarketContext('BTC', { ...ctx, midPx: null })

    expect(result.midPrice).toBe('95000')
  })

  it('rounds nextFundingTime up to the next hour boundary', () => {
    vi.setSystemTime(new Date('2024-01-01T00:30:00Z'))
    const expected = Math.ceil(Date.now() / HOUR_MS) * HOUR_MS

    expect(mapMarketContext('BTC', ctx).funding?.nextFundingTime).toBe(expected)
    // 00:30 rounds up to 01:00.
    expect(new Date(expected).toISOString()).toBe('2024-01-01T01:00:00.000Z')
  })

  it('keeps nextFundingTime at the boundary when already on the hour', () => {
    vi.setSystemTime(new Date('2024-01-01T02:00:00.000Z'))

    expect(mapMarketContext('BTC', ctx).funding?.nextFundingTime).toBe(
      Date.parse('2024-01-01T02:00:00.000Z')
    )
  })
})
