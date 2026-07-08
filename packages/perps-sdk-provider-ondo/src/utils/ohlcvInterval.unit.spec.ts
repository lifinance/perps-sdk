import type { OhlcvInterval } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { intervalFromBarSpan, mapInterval } from './ohlcvInterval.js'

// Hardcoded mirror of the backend provider identity's advertised
// `supportedIntervals` (`ONDO_SUPPORTED_INTERVALS` keys in
// lifi-perps-backend src/providers/ondo/ondo.assets.ts). A mismatch here is
// the cross-repo drift alarm: the widget advertises these, so the WS map must
// accept every one of them.
const ADVERTISED_INTERVALS: OhlcvInterval[] = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
  '1w',
  '1M',
]

// Ondo's WS `resolution` vocabulary: bare minute counts, letter-suffixed for
// hour and up.
const WS_RESOLUTION: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
  '1w': '1W',
  '1M': '1M',
}

const ALL_INTERVALS: OhlcvInterval[] = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '8h',
  '12h',
  '1d',
  '3d',
  '1w',
  '1M',
]

describe('mapInterval', () => {
  it('accepts exactly the advertised interval set', () => {
    const accepted = ALL_INTERVALS.filter((interval) => {
      try {
        mapInterval(interval)
        return true
      } catch {
        return false
      }
    })
    expect(new Set(accepted)).toEqual(new Set(ADVERTISED_INTERVALS))
  })

  for (const interval of ADVERTISED_INTERVALS) {
    it(`maps '${interval}' to '${WS_RESOLUTION[interval]}'`, () => {
      expect(mapInterval(interval)).toBe(WS_RESOLUTION[interval])
    })
  }

  it('rejects intervals Ondo does not offer', () => {
    for (const interval of ALL_INTERVALS.filter(
      (i) => !ADVERTISED_INTERVALS.includes(i)
    )) {
      expect(() => mapInterval(interval)).toThrow(
        /does not support OHLCV interval/
      )
    }
  })
})

describe('intervalFromBarSpan', () => {
  it('recovers each fixed-span interval from its bar span in seconds', () => {
    expect(intervalFromBarSpan(60)).toBe('1m')
    expect(intervalFromBarSpan(300)).toBe('5m')
    expect(intervalFromBarSpan(900)).toBe('15m')
    expect(intervalFromBarSpan(1800)).toBe('30m')
    expect(intervalFromBarSpan(3600)).toBe('1h')
    expect(intervalFromBarSpan(14400)).toBe('4h')
    expect(intervalFromBarSpan(86400)).toBe('1d')
    expect(intervalFromBarSpan(604800)).toBe('1w')
  })

  it('recovers 1M from every calendar-month span (28-31 days)', () => {
    for (const days of [28, 29, 30, 31]) {
      expect(intervalFromBarSpan(days * 86400)).toBe('1M')
    }
  })

  it('returns undefined for an unknown span', () => {
    expect(intervalFromBarSpan(180)).toBeUndefined()
  })
})
