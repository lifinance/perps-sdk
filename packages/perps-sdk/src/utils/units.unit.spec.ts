import { describe, expect, it } from 'vitest'
import { fromBaseUnits, fromBaseUnitsNumber } from './units.js'

describe('fromBaseUnits', () => {
  it('should convert USDC base units (6 decimals)', () => {
    expect(fromBaseUnits('1000000', 6)).toBe('1')
  })

  it('should convert ETH base units (18 decimals)', () => {
    expect(fromBaseUnits('1000000000000000000', 18)).toBe('1')
  })

  it('should handle fractional values', () => {
    expect(fromBaseUnits('500000', 6)).toBe('0.5')
  })

  it('should return 0 for invalid input', () => {
    expect(fromBaseUnits('not-a-number', 6)).toBe('0')
  })
})

describe('fromBaseUnitsNumber', () => {
  it('should return a number', () => {
    expect(fromBaseUnitsNumber('1000000', 6)).toBe(1)
  })

  it('should return 0 for invalid input', () => {
    expect(fromBaseUnitsNumber('bad', 6)).toBe(0)
  })
})
