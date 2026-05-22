import { describe, expect, it } from 'vitest'
import { mapInterval } from './ohlcvInterval.js'

describe('mapInterval', () => {
  it.each([
    ['1m', '1m'],
    ['5m', '5m'],
    ['15m', '15m'],
    ['30m', '30m'],
    ['1h', '1h'],
    ['4h', '4h'],
    ['12h', '12h'],
    ['1d', '1d'],
    ['1w', '1w'],
  ])('maps %s → %s', (input, expected) => {
    expect(mapInterval(input)).toBe(expected)
  })

  it.each([
    '3m',
    '2h',
    '8h',
    '3d',
    '1M',
  ])('rejects unsupported interval %s with ValidationError', (interval) => {
    expect(() => mapInterval(interval)).toThrow(/does not support/i)
  })
})
