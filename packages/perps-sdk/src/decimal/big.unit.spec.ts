import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import { DivBig, RoundUpBig, TruncBig } from './big.js'

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

describe('RoundUpBig', () => {
  it('rounds a non-terminating quotient up at the 40th digit instead of half up', () => {
    expect(new RoundUpBig(1).div(3).toFixed()).toBe(`0.${'3'.repeat(39)}4`)
    expect(new DivBig(1).div(3).toFixed()).toBe(`0.${'3'.repeat(40)}`)
    expect(Big.RM).toBe(Big.roundHalfUp)
  })

  it('keeps a terminating quotient exact', () => {
    expect(new RoundUpBig(10).div(4).toFixed()).toBe('2.5')
  })
})
