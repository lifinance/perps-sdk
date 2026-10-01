import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import { areFinite, DivBig, TruncBig } from './decimal.js'

describe('DivBig', () => {
  it('divides to 40 decimal places without a change to the global Big.DP', () => {
    expect(new DivBig(1).div(3).toFixed()).toBe(`0.${'3'.repeat(40)}`)
    expect(Big.DP).toBe(20)
  })
})

describe('TruncBig', () => {
  it('truncates the 41st digit instead of rounding half up', () => {
    expect(new TruncBig(2).div(3).toFixed()).toBe(`0.${'6'.repeat(40)}`)
    expect(new DivBig(2).div(3).toFixed()).toBe(`0.${'6'.repeat(39)}7`)
    expect(Big.RM).toBe(Big.roundHalfUp)
  })
})

describe('areFinite', () => {
  it('is true when every value is finite', () => {
    expect(areFinite(0, -1.5, 1e300)).toBe(true)
    expect(areFinite()).toBe(true)
  })

  it('is false when any value is NaN or infinite', () => {
    expect(areFinite(1, Number.NaN)).toBe(false)
    expect(areFinite(Number.NEGATIVE_INFINITY, 1)).toBe(false)
  })
})
