import type { OhlcvInterval } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { mapInterval } from './ohlcvInterval.js'

const SUPPORTED_CASES: [OhlcvInterval, string][] = [
  ['1m', '1m'],
  ['5m', '5m'],
  ['15m', '15m'],
  ['30m', '30m'],
  ['1h', '1h'],
  ['4h', '4h'],
  ['12h', '12h'],
  ['1d', '1d'],
  ['1w', '1w'],
]

const UNSUPPORTED_INTERVALS: OhlcvInterval[] = ['3m', '2h', '8h', '3d', '1M']

describe('mapInterval', () => {
  it.each(SUPPORTED_CASES)('maps %s → %s', (input, expected) => {
    expect(mapInterval(input)).toBe(expected)
  })

  it.each(
    UNSUPPORTED_INTERVALS
  )('rejects unsupported interval %s with ValidationError', (interval) => {
    expect(() => mapInterval(interval)).toThrow(/does not support/i)
  })
})
