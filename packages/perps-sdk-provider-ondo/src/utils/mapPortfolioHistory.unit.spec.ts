import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode, type PortfolioHistoryRange } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type {
  OndoPortfolioGraphPoint,
  OndoPortfolioSummary,
} from '../types/wire.js'
import { mapPortfolioHistory } from './mapPortfolioHistory.js'

const point = (
  overrides: Partial<OndoPortfolioGraphPoint>
): OndoPortfolioGraphPoint => ({
  time: '2025-03-04T00:00:00Z',
  marginBalance: '4800.00',
  totalPnL: '180.00',
  realizedPnl: '200.00',
  netInvested: '4620.00',
  fillVolume: '240000.00',
  allTimeDeposits: '5000.00',
  allTimeWithdrawals: '500.00',
  ...overrides,
})

const SUMMARY: OndoPortfolioSummary = {
  marginBalance: '4950.00',
  netInvested: '4750.00',
  totalPnL: '9999.00',
  realizedPnl: '250.00',
  volume7d: '15000.00',
  volume30d: '85000.00',
  volumeAllTime: '250000.00',
}

const GRAPH = [
  point({}),
  point({
    time: '2025-03-05T00:00:00Z',
    marginBalance: '4950.00',
    totalPnL: '232.00',
  }),
]

describe('mapPortfolioHistory', () => {
  it.each<[PortfolioHistoryRange, string | undefined]>([
    ['24h', undefined],
    ['7d', '15000.00'],
    ['30d', '85000.00'],
    ['all', '250000.00'],
  ])('selects the %s volume field from the summary', (range, volume) => {
    expect(mapPortfolioHistory(range, GRAPH, SUMMARY).volume).toBe(volume)
  })

  it('maps each graph point and takes the window totalPnl from the last one', () => {
    expect(mapPortfolioHistory('7d', GRAPH, SUMMARY)).toEqual({
      range: '7d',
      points: [
        {
          timestamp: Date.parse('2025-03-04T00:00:00Z'),
          accountValue: '4800.00',
          pnl: '180.00',
        },
        {
          timestamp: Date.parse('2025-03-05T00:00:00Z'),
          accountValue: '4950.00',
          pnl: '232.00',
        },
      ],
      volume: '15000.00',
      totalPnl: '232.00',
    })
  })

  it('reports no totalPnl without graph points', () => {
    expect(mapPortfolioHistory('30d', [], SUMMARY)).toEqual({
      range: '30d',
      points: [],
      volume: '85000.00',
      totalPnl: undefined,
    })
  })

  it('throws a ThirdPartyError for an unparsable point time', () => {
    const read = () =>
      mapPortfolioHistory('7d', [point({ time: 'yesterday' })], SUMMARY)

    expect(read).toThrowError(PerpsError)
    expect(read).toThrowError(
      expect.objectContaining({ code: PerpsErrorCode.ThirdPartyError })
    )
  })
})
