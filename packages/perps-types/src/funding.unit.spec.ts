import { describe, expect, expectTypeOf, it } from 'vitest'
import type { DecimalString } from './decimal.js'
import type {
  FundingAveragesResponse,
  FundingHistoryRange,
  FundingHistoryResponse,
  FundingWindow,
  MarketFundingAverages,
} from './funding.js'

describe('FundingAveragesResponse', () => {
  it('carries one signed decimal-string rate for each window', () => {
    const averages: MarketFundingAverages = {
      provider: 'hyperliquid',
      marketId: 'BTC',
      rate: {
        '8h': '0.0000125',
        '24h': '0.0000100',
        '3d': '-0.0000050',
        '7d': '0.0000080',
      },
      coveredFrom: 1_741_046_400_000,
    }
    const response: FundingAveragesResponse = { averages: [averages] }

    expect(Object.keys(response.averages[0].rate).sort()).toEqual(
      ['24h', '3d', '7d', '8h'].sort()
    )
    expect(response.averages[0].rate['3d']).toBe('-0.0000050')
    expect(response.averages[0].coveredFrom).toBe(1_741_046_400_000)
  })

  it('types rate as a decimal-string rate for each window that has one', () => {
    expectTypeOf<MarketFundingAverages['rate']>().toEqualTypeOf<
      Partial<Record<FundingWindow, DecimalString>>
    >()
  })

  it('omits a window with no settled rate and keeps a measured zero', () => {
    const averages: MarketFundingAverages = {
      provider: 'hyperliquid',
      marketId: 'HYPE',
      rate: { '24h': '0', '3d': '0.0000095', '7d': '0.0000100' },
      coveredFrom: 1_741_046_400_000,
    }

    expect(averages.rate).not.toHaveProperty('8h')
    expect(averages.rate['24h']).toBe('0')
  })

  it('accepts every averaging window', () => {
    const windows: FundingWindow[] = ['8h', '24h', '3d', '7d']
    expect(windows).toHaveLength(4)
  })
})

describe('FundingHistoryResponse', () => {
  it('carries bucket points with a millisecond timestamp and a decimal-string rate', () => {
    const response: FundingHistoryResponse = {
      provider: 'lighter',
      marketId: '1',
      range: '7d',
      points: [
        { timestamp: 1_741_046_400_000, rate: '0.0000125' },
        { timestamp: 1_741_132_800_000, rate: '-0.000003' },
      ],
    }

    expect(response.points[0].timestamp).toBe(1_741_046_400_000)
    expect(typeof response.points[1].rate).toBe('string')
  })

  it('accepts every history range', () => {
    const ranges: FundingHistoryRange[] = ['7d', '30d', '90d']
    expect(ranges).toHaveLength(3)
  })
})
