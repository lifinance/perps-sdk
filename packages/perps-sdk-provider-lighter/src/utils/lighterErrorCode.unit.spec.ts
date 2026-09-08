import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { lighterErrorCodeFromBody } from './lighterErrorCode.js'

describe('lighterErrorCodeFromBody', () => {
  it.each<[number, PerpsErrorCode]>([
    [21104, PerpsErrorCode.InvalidNonce],
    [21105, PerpsErrorCode.InvalidNonce],
    [21301, PerpsErrorCode.InsufficientBalance],
    [21304, PerpsErrorCode.InsufficientBalance],
    [21305, PerpsErrorCode.InsufficientBalance],
    [21507, PerpsErrorCode.InsufficientMargin],
    [21508, PerpsErrorCode.InsufficientMargin],
    [21739, PerpsErrorCode.InsufficientMargin],
  ])('maps venue code %i to PerpsErrorCode %i', (venueCode, code) => {
    expect(lighterErrorCodeFromBody(venueCode)).toBe(code)
  })

  it.each([
    undefined,
    200,
    20013,
    21101,
    21702,
  ])('returns undefined for %s', (venueCode) => {
    expect(lighterErrorCodeFromBody(venueCode)).toBeUndefined()
  })
})
