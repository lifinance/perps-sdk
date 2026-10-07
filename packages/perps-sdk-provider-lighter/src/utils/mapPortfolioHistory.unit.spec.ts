import { describe, expect, it, vi } from 'vitest'
import type { LtPnLEntry } from '../types/pnl.js'
import { mapPortfolioHistory } from './mapPortfolioHistory.js'

function snapshot(overrides: Partial<LtPnLEntry>): LtPnLEntry {
  return {
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
  }
}

describe('mapPortfolioHistory', () => {
  it('skips a snapshot with a non-finite value and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = mapPortfolioHistory(
      '7d',
      [
        snapshot({ timestamp: 1, trade_pnl: 1, volume: 10 }),
        snapshot({ timestamp: 2, trade_pnl: Number.NaN }),
        snapshot({ timestamp: 3, trade_pnl: 4, volume: 30 }),
      ],
      '100'
    )

    expect(result.points.map((p) => p.timestamp)).toEqual([1_000, 3_000])
    expect(result.volume).toBe('20')
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        '[lighter] skipping portfolio history row: `trade_pnl`'
      )
    )
    warn.mockRestore()
  })

  it('derives window changes from cumulative Lighter snapshots', () => {
    const snapshots = [
      snapshot({
        timestamp: 1_700_000_000,
        trade_pnl: 10.5,
        trade_spot_pnl: 1.5,
        inflow: 100,
        volume: 1_000,
      }),
      snapshot({
        timestamp: 1_700_003_600,
        trade_pnl: 8.25,
        trade_spot_pnl: 2.75,
        inflow: 100,
        outflow: 50,
        volume: 1_500,
      }),
      snapshot({
        timestamp: 1_700_007_200,
        trade_pnl: 12.25,
        trade_spot_pnl: 3.5,
        inflow: 120,
        outflow: 50,
        volume: 1_750.5,
      }),
    ]

    expect(mapPortfolioHistory('7d', snapshots, '562.25')).toEqual({
      range: '7d',
      points: [
        { timestamp: 1_700_000_000_000, accountValue: '588.5', pnl: '0' },
        { timestamp: 1_700_003_600_000, accountValue: '537.5', pnl: '-1' },
        { timestamp: 1_700_007_200_000, accountValue: '562.25', pnl: '3.75' },
      ],
      volume: '750.5',
      totalPnl: '3.75',
    })
  })

  it('does not repeatedly add unchanged cumulative totals', () => {
    const cumulative = {
      trade_pnl: -53.05194,
      trade_spot_pnl: 32.344901,
      inflow: 100,
      outflow: 50,
      volume: 2_000,
    }
    const snapshots = [
      snapshot({ timestamp: 1_700_000_000, ...cumulative }),
      snapshot({ timestamp: 1_700_003_600, ...cumulative }),
    ]

    expect(mapPortfolioHistory('24h', snapshots, '6.02')).toEqual({
      range: '24h',
      points: [
        { timestamp: 1_700_000_000_000, accountValue: '6.02', pnl: '0' },
        { timestamp: 1_700_003_600_000, accountValue: '6.02', pnl: '0' },
      ],
      volume: '0',
      totalPnl: '0',
    })
  })

  it('orders cumulative snapshots before deriving their changes', () => {
    const snapshots = [
      snapshot({ timestamp: 1_700_003_600, trade_pnl: 5 }),
      snapshot({ timestamp: 1_700_000_000, trade_pnl: 1 }),
    ]

    expect(mapPortfolioHistory('24h', snapshots, '100').points).toEqual([
      { timestamp: 1_700_000_000_000, accountValue: '96', pnl: '0' },
      { timestamp: 1_700_003_600_000, accountValue: '100', pnl: '4' },
    ])
  })

  it('anchors a single cumulative snapshot to the current account value', () => {
    expect(
      mapPortfolioHistory(
        '24h',
        [
          snapshot({
            timestamp: 1_700_000_000,
            trade_pnl: 12.5,
            inflow: 100,
            outflow: 25,
            volume: 2_000,
          }),
        ],
        '250'
      )
    ).toEqual({
      range: '24h',
      points: [{ timestamp: 1_700_000_000_000, accountValue: '250', pnl: '0' }],
      volume: '0',
      totalPnl: '0',
    })
  })

  it.each([
    {
      name: 'a perps-to-spot transfer keeps the value flat',
      transfer: { outflow: 1_000, spot_inflow: 1_000 },
      earlierValue: '5000',
    },
    {
      name: 'a spot-to-perps transfer keeps the value flat',
      transfer: { inflow: 148_876.77, spot_outflow: 148_876.77 },
      earlierValue: '5000',
    },
    {
      name: 'a spot-only deposit lowers the earlier value',
      transfer: { spot_inflow: 103 },
      earlierValue: '4897',
    },
  ])('unwinds spot-route flows: $name', ({ transfer, earlierValue }) => {
    const snapshots = [
      snapshot({ timestamp: 1_764_892_800, trade_pnl: 7 }),
      snapshot({ timestamp: 1_764_979_200, trade_pnl: 7, ...transfer }),
    ]

    expect(mapPortfolioHistory('all', snapshots, '5000').points).toEqual([
      {
        timestamp: 1_764_892_800_000,
        accountValue: earlierValue,
        pnl: '0',
      },
      { timestamp: 1_764_979_200_000, accountValue: '5000', pnl: '0' },
    ])
  })

  it('returns no totalPnl and zero volume without snapshots', () => {
    expect(mapPortfolioHistory('all', [], '100')).toEqual({
      range: 'all',
      points: [],
      volume: '0',
      totalPnl: undefined,
    })
  })
})
