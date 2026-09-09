import { describe, expect, it } from 'vitest'
import type {
  PortfolioHistoryPoint,
  PortfolioHistoryRange,
  PortfolioHistoryResponse,
} from './portfolioHistory.js'

describe('PortfolioHistoryResponse', () => {
  it('carries decimal-string values and a millisecond timestamp', () => {
    const point: PortfolioHistoryPoint = {
      timestamp: 1_741_046_400_000,
      accountValue: '4950.00',
      pnl: '232.00',
    }
    const response: PortfolioHistoryResponse = {
      range: '7d',
      points: [point],
      volume: '15000.00',
      totalPnl: '232.00',
    }

    expect(response.points[0].timestamp).toBe(1_741_046_400_000)
    expect(typeof response.points[0].accountValue).toBe('string')
    expect(typeof response.points[0].pnl).toBe('string')
  })

  it('accepts every lookback window', () => {
    const ranges: PortfolioHistoryRange[] = ['24h', '7d', '30d', 'all']
    expect(ranges).toHaveLength(4)
  })
})
