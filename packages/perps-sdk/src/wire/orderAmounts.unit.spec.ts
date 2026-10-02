import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import {
  marginFromNotional,
  marginFromSize,
  sizeFromMargin,
  sizeFromNotional,
} from './orderAmounts.js'

// 2 ÷ 3 = 0.666…: truncation ends in 6, round-half-up would end in 7.
const TWO_THIRDS_TRUNCATED = `0.${'6'.repeat(40)}`

describe('sizeFromMargin', () => {
  it('derives size = margin × leverage ÷ price', () => {
    expect(sizeFromMargin(new Big('100'), 10, new Big('2000')).eq('0.5')).toBe(
      true
    )
  })

  it('truncates so size × price never exceeds margin × leverage', () => {
    const size = sizeFromMargin(new Big('1'), 2, new Big('3'))
    expect(size.toFixed()).toBe(TWO_THIRDS_TRUNCATED)
    expect(size.times('3').lte('2')).toBe(true)
  })

  it('leaves the global Big rounding and precision untouched', () => {
    sizeFromMargin(new Big('1'), 1, new Big('3'))
    expect(Big.DP).toBe(20)
    expect(Big.RM).toBe(Big.roundHalfUp)
  })
})

describe('marginFromSize', () => {
  it('derives margin = size × price ÷ leverage', () => {
    expect(marginFromSize(new Big('0.5'), 10, new Big('2000')).eq('100')).toBe(
      true
    )
  })

  it('truncates so margin × leverage never exceeds size × price', () => {
    const margin = marginFromSize(new Big('2'), 3, new Big('1'))
    expect(margin.toFixed()).toBe(TWO_THIRDS_TRUNCATED)
    expect(margin.times(3).lte('2')).toBe(true)
  })

  it('is the inverse of sizeFromMargin for exact quotients', () => {
    const size = sizeFromMargin(new Big('250'), 4, new Big('50'))
    expect(marginFromSize(size, 4, new Big('50')).eq('250')).toBe(true)
  })
})

describe('sizeFromNotional', () => {
  it('derives size = notional ÷ price', () => {
    expect(sizeFromNotional(new Big('1000'), new Big('2000')).eq('0.5')).toBe(
      true
    )
  })

  it('truncates so size × price never exceeds the notional', () => {
    const size = sizeFromNotional(new Big('2'), new Big('3'))
    expect(size.toFixed()).toBe(TWO_THIRDS_TRUNCATED)
    expect(size.times('3').lte('2')).toBe(true)
  })
})

describe('marginFromNotional', () => {
  it('derives margin = notional ÷ leverage', () => {
    expect(marginFromNotional(new Big('1000'), 10).eq('100')).toBe(true)
  })

  it('truncates so margin × leverage never exceeds the notional', () => {
    const margin = marginFromNotional(new Big('2'), 3)
    expect(margin.toFixed()).toBe(TWO_THIRDS_TRUNCATED)
    expect(margin.times(3).lte('2')).toBe(true)
  })
})
