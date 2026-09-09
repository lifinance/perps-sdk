import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import type { LtPnLEntry } from '../types/pnl.js'
import { mapPortfolioHistory } from './mapPortfolioHistory.js'

const bucket = (overrides: Partial<LtPnLEntry>): LtPnLEntry => ({
  timestamp: 0,
  trade_pnl: 0,
  inflow: 0,
  outflow: 0,
  pool_pnl: 0,
  pool_inflow: 0,
  pool_outflow: 0,
  pool_total_shares: 0,
  spot_inflow: 0,
  spot_outflow: 0,
  staked_lit: 0,
  staking_inflow: 0,
  staking_outflow: 0,
  staking_pnl: 0,
  trade_spot_pnl: 0,
  volume: 0,
  ...overrides,
})

describe('mapPortfolioHistory', () => {
  it('walks the account value backwards from the current value', () => {
    const entries = [
      bucket({ timestamp: 1_000, trade_pnl: 10.5, inflow: 100, volume: 1_000 }),
      bucket({ timestamp: 2_000, trade_pnl: -2.25, outflow: 50, volume: 500 }),
      bucket({
        timestamp: 3_000,
        trade_pnl: 4,
        trade_spot_pnl: 0.75,
        volume: 250.5,
      }),
    ]

    const result = mapPortfolioHistory('7d', entries, new Big('562.25'))

    expect(result).toEqual({
      range: '7d',
      points: [
        { timestamp: 1_000, accountValue: '609.75', pnl: '10.5' },
        { timestamp: 2_000, accountValue: '557.5', pnl: '8.25' },
        { timestamp: 3_000, accountValue: '562.25', pnl: '13' },
      ],
      volume: '1750.5',
      totalPnl: '13',
    })
  })

  it('unwinds the spot PnL the running pnl adds', () => {
    const entries = [
      bucket({ timestamp: 1_000, trade_pnl: 1, trade_spot_pnl: 2 }),
      bucket({ timestamp: 2_000, trade_pnl: 3, trade_spot_pnl: 4 }),
    ]

    const result = mapPortfolioHistory('30d', entries, new Big('110'))

    expect(result.points).toEqual([
      { timestamp: 1_000, accountValue: '103', pnl: '3' },
      { timestamp: 2_000, accountValue: '110', pnl: '10' },
    ])
  })

  it('orders buckets by timestamp before the walk', () => {
    const entries = [
      bucket({ timestamp: 2_000, trade_pnl: 5 }),
      bucket({ timestamp: 1_000, trade_pnl: 1 }),
    ]

    const result = mapPortfolioHistory('24h', entries, new Big('100'))

    expect(result.points).toEqual([
      { timestamp: 1_000, accountValue: '95', pnl: '1' },
      { timestamp: 2_000, accountValue: '100', pnl: '6' },
    ])
  })

  it('returns no totalPnl and zero volume without buckets', () => {
    expect(mapPortfolioHistory('all', [], new Big('100'))).toEqual({
      range: 'all',
      points: [],
      volume: '0',
      totalPnl: undefined,
    })
  })
})
