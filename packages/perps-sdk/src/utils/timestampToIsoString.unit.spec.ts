import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  safeTimestampToIsoString,
  timestampToIsoString,
} from './timestampToIsoString.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('timestampToIsoString', () => {
  it.each([
    [1_700_000_000_000, '2023-11-14T22:13:20.000Z'],
    ['2023-11-14T22:13:20Z', '2023-11-14T22:13:20.000Z'],
  ])('reads %j', (value, expected) => {
    expect(timestampToIsoString(value)).toBe(expected)
  })

  it.each([
    '',
    'not-a-time',
    Number.NaN,
    8.64e15 + 1,
  ])('throws ValidationError for %j', (value) => {
    expect(() => timestampToIsoString(value)).toThrowError(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})

describe('safeTimestampToIsoString', () => {
  it('reads a valid time', () => {
    expect(safeTimestampToIsoString(1_700_000_000_000)).toBe(
      '2023-11-14T22:13:20.000Z'
    )
  })

  it('gives undefined and warns for a bad time', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeTimestampToIsoString('not-a-time')).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
  })
})
