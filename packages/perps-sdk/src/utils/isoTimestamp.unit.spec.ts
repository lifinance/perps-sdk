import { describe, expect, it } from 'vitest'
import { asIsoTimestamp } from './isoTimestamp.js'

describe('asIsoTimestamp', () => {
  it.each([
    [1_700_000_000_000, '2023-11-14T22:13:20.000Z'],
    ['2023-11-14T22:13:20Z', '2023-11-14T22:13:20.000Z'],
  ])('reads %j', (value, expected) => {
    expect(asIsoTimestamp(value)).toBe(expected)
  })

  it.each([
    undefined,
    null,
    '',
    'not-a-time',
    Number.NaN,
    8.64e15 + 1,
  ])('gives undefined for %j without a throw', (value) => {
    expect(asIsoTimestamp(value)).toBeUndefined()
  })
})
