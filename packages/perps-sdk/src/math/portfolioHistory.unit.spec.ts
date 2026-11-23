import type { PortfolioHistoryPoint } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { buildPortfolioHistoryWindow } from './portfolioHistory.js'

const HOUR_MS = 60 * 60 * 1_000
const START = 1_741_046_400_000
const END = START + 4 * HOUR_MS

const point = (
  hoursFromStart: number,
  accountValue: string,
  pnl: string,
  netTransfers?: string
): PortfolioHistoryPoint => ({
  timestamp: START + hoursFromStart * HOUR_MS,
  accountValue,
  pnl,
  ...(netTransfers === undefined ? {} : { netTransfers }),
})

const SAMPLES = [
  point(-5, '90', '-10', '0'),
  point(-2, '100', '0', '10'),
  point(1, '105', '5', '10'),
  point(4, '125', '15', '20'),
  point(6, '130', '20', '20'),
]

describe('buildPortfolioHistoryWindow', () => {
  it('returns the latest sample before the start as the opening and rebases the points', () => {
    expect(
      buildPortfolioHistoryWindow('venue', SAMPLES, { start: START, end: END })
    ).toEqual({
      opening: point(-2, '100', '0', '0'),
      points: [point(1, '105', '5', '0'), point(4, '125', '15', '10')],
    })
  })

  it('takes a sample at the exact start as the opening, not as a point', () => {
    const result = buildPortfolioHistoryWindow(
      'venue',
      [point(-2, '100', '0'), point(0, '101', '1'), point(1, '103', '3')],
      { start: START, end: END }
    )

    expect(result).toEqual({
      opening: point(0, '101', '0'),
      points: [point(1, '103', '2')],
    })
  })

  it('keeps a sample at the exact end and excludes samples after it', () => {
    const result = buildPortfolioHistoryWindow('venue', SAMPLES, {
      start: START,
      end: START + 4 * HOUR_MS,
    })

    expect(result.points.map((p) => p.timestamp)).toEqual([
      START + HOUR_MS,
      START + 4 * HOUR_MS,
    ])
  })

  it('returns no opening and rebases onto the first point when no sample is at or before the start', () => {
    const result = buildPortfolioHistoryWindow(
      'venue',
      [point(1, '105', '5', '10'), point(4, '125', '15', '20')],
      { start: START, end: END }
    )

    expect(result).toEqual({
      points: [point(1, '105', '0', '0'), point(4, '125', '10', '10')],
    })
    expect(result.opening).toBeUndefined()
  })

  it('orders unsorted samples before it selects the opening', () => {
    const result = buildPortfolioHistoryWindow(
      'venue',
      [point(-5, '90', '-10'), point(1, '105', '5'), point(-2, '100', '0')],
      { start: START, end: END }
    )

    expect(result.opening).toEqual(point(-2, '100', '0'))
    expect(result.points).toEqual([point(1, '105', '5')])
  })

  it('skips a sample with an invalid value and warns, so it cannot be the opening', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = buildPortfolioHistoryWindow(
      'venue',
      [
        point(-5, '90', '-10'),
        point(-2, 'n/a', '0'),
        point(1, '105', ''),
        point(2, '110', '10'),
      ],
      { start: START, end: END }
    )

    expect(result).toEqual({
      opening: point(-5, '90', '0'),
      points: [point(2, '110', '20')],
    })
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        '[venue] skipping portfolio history row: `accountValue`'
      )
    )
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[venue] skipping portfolio history row: `pnl`')
    )
    warn.mockRestore()
  })

  it('keeps transfers unavailable when the first retained sample or the sample has none', () => {
    const result = buildPortfolioHistoryWindow(
      'venue',
      [
        point(-2, '100', '0'),
        point(1, '105', '5', '10'),
        point(2, '110', '10'),
      ],
      { start: START, end: END }
    )

    expect(result.opening?.netTransfers).toBeUndefined()
    expect(result.points.map((p) => p.netTransfers)).toEqual([
      undefined,
      undefined,
    ])
  })

  it('returns no samples when every sample is after the end', () => {
    expect(
      buildPortfolioHistoryWindow('venue', [point(6, '130', '20')], {
        start: START,
        end: END,
      })
    ).toEqual({ points: [] })
  })

  it('returns an opening with no points when every later sample is after the end', () => {
    expect(
      buildPortfolioHistoryWindow(
        'venue',
        [point(-2, '100', '3', '7'), point(6, '130', '20', '9')],
        { start: START, end: END }
      )
    ).toEqual({ opening: point(-2, '100', '0', '0'), points: [] })
  })

  it('skips a sample with a non-finite timestamp and warns, so it cannot be the opening', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = buildPortfolioHistoryWindow(
      'venue',
      [
        point(-5, '90', '-10'),
        { timestamp: Number.NaN, accountValue: '100', pnl: '0' },
        point(1, '105', '5'),
      ],
      { start: START, end: END }
    )

    expect(result).toEqual({
      opening: point(-5, '90', '0'),
      points: [point(1, '105', '15')],
    })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        '[venue] skipping portfolio history row: `timestamp` is not a valid timestamp'
      )
    )
    warn.mockRestore()
  })

  it('keeps samples with one timestamp in input order and takes the last one at the start as the opening', () => {
    const result = buildPortfolioHistoryWindow(
      'venue',
      [
        point(0, '100', '0'),
        point(0, '101', '1'),
        point(2, '110', '10'),
        point(2, '111', '11'),
      ],
      { start: START, end: END }
    )

    expect(result).toEqual({
      opening: point(0, '101', '0'),
      points: [point(2, '110', '9'), point(2, '111', '10')],
    })
  })

  it('returns the opening alone when the start equals the end', () => {
    expect(
      buildPortfolioHistoryWindow('venue', SAMPLES, {
        start: START,
        end: START,
      })
    ).toEqual({ opening: point(-2, '100', '0', '0'), points: [] })
    expect(
      buildPortfolioHistoryWindow(
        'venue',
        [point(-2, '100', '0'), point(0, '101', '1')],
        { start: START, end: START }
      )
    ).toEqual({ opening: point(0, '101', '0'), points: [] })
  })
})
