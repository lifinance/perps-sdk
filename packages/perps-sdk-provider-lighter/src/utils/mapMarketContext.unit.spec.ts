import { describe, expect, it } from 'vitest'
import type { LtWsMarketStats, LtWsSpotMarketStats } from '../types/index.js'
import { mapMarketContext } from './mapMarketContext.js'

const perpStats: LtWsMarketStats = {
  market_id: 1,
  index_price: '94998',
  mark_price: '95000',
  mid_price: '95001',
  open_interest: '1234.5',
  last_trade_price: '95002',
  current_funding_rate: '0.0001',
  funding_rate: '0.00009',
  funding_timestamp: 1704067200000,
  daily_base_token_volume: '10',
  daily_quote_token_volume: '987654',
  daily_price_change: '1.5',
}

const spotStats: LtWsSpotMarketStats = {
  market_id: 2048,
  symbol: 'LIT/USDC',
  index_price: '3.2',
  mid_price: '3.21',
  best_ask_price: '3.22',
  best_bid_price: '3.20',
  last_trade_price: '3.21',
  daily_base_token_volume: 100,
  daily_quote_token_volume: 321,
  daily_price_low: 3.0,
  daily_price_high: 3.4,
  daily_price_change: 0.1,
}

describe('mapMarketContext (Lighter)', () => {
  it('maps a perp stats record with oracle, mark, mid, funding and OI', () => {
    const result = mapMarketContext(perpStats)

    expect(result.marketId).toBe('1')
    expect(result.midPrice).toBe('95001')
    expect(result.markPrice).toBe('95000')
    expect(result.oraclePrice).toBe('94998')
    expect(result.volume24h).toBe('987654')
    expect(result.openInterest).toBe('1234.5')
    expect(result.funding).toEqual({
      rate: '0.0001',
      nextFundingTime: 1704067200000,
    })
  })

  it('maps a spot stats record, falling mark back to mid with no funding/OI', () => {
    const result = mapMarketContext(spotStats)

    expect(result.marketId).toBe('2048')
    expect(result.midPrice).toBe('3.21')
    expect(result.markPrice).toBe('3.21')
    expect(result.oraclePrice).toBe('3.2')
    expect(result.volume24h).toBe('321')
    expect(result.openInterest).toBeUndefined()
    expect(result.funding).toBeUndefined()
  })
})
