import { describe, expect, it, vi } from 'vitest'
import { fundingPercentToFraction } from './fundingRate.js'

describe('fundingPercentToFraction', () => {
  it.each([
    ['0.0012', '0.000012'],
    ['-0.0008', '-0.000008'],
    ['0.0000001', '0.000000001'],
    ['4', '0.04'],
    ['0', '0'],
  ])('converts %s %% to the fraction %s', (percent, fraction) => {
    expect(fundingPercentToFraction(percent)).toBe(fraction)
  })

  it.each([
    [''],
    ['0.01%'],
    ['1e-4'],
  ])('gives undefined for %j, which does not match the decimal pattern', (value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(fundingPercentToFraction(value)).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
