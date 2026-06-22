import { describe, expect, it } from 'vitest'
import {
  formatOrderPrice,
  formatOrderSize,
  getMaxPriceDecimals,
} from './orderFormatting.js'

describe('getMaxPriceDecimals', () => {
  it('should return 6 - szDecimals for normal assets', () => {
    expect(getMaxPriceDecimals(0)).toBe(6)
    expect(getMaxPriceDecimals(1)).toBe(5)
    expect(getMaxPriceDecimals(2)).toBe(4)
    expect(getMaxPriceDecimals(3)).toBe(3)
    expect(getMaxPriceDecimals(4)).toBe(2)
    expect(getMaxPriceDecimals(5)).toBe(1)
    expect(getMaxPriceDecimals(6)).toBe(0)
  })

  it('should clamp to zero for szDecimals exceeding max', () => {
    expect(getMaxPriceDecimals(7)).toBe(0)
    expect(getMaxPriceDecimals(10)).toBe(0)
  })
})

describe('formatOrderSize', () => {
  it('should truncate to szDecimals (not round up)', () => {
    // szDecimals=2: 1.999 should truncate to 1.99, not round to 2.00
    expect(formatOrderSize(1.999, 2)).toBe('1.99')
  })

  it('should remove trailing zeros', () => {
    expect(formatOrderSize(1.5, 4)).toBe('1.5')
    expect(formatOrderSize(1.0, 2)).toBe('1')
    expect(formatOrderSize(2.1, 3)).toBe('2.1')
  })

  it('should handle zero szDecimals (whole number assets)', () => {
    expect(formatOrderSize(3.7, 0)).toBe('3')
    expect(formatOrderSize(10.99, 0)).toBe('10')
  })

  it('should handle exact values', () => {
    expect(formatOrderSize(0.5, 1)).toBe('0.5')
    expect(formatOrderSize(1, 2)).toBe('1')
  })

  it('should handle very small sizes', () => {
    expect(formatOrderSize(0.00123456, 4)).toBe('0.0012')
  })

  it('should handle BTC-like szDecimals (5)', () => {
    // BTC has szDecimals=5 on Hyperliquid
    expect(formatOrderSize(0.123456789, 5)).toBe('0.12345')
  })

  it('should handle ETH-like szDecimals (4)', () => {
    expect(formatOrderSize(1.23456, 4)).toBe('1.2345')
  })

  it('should return zero for zero size', () => {
    expect(formatOrderSize(0, 4)).toBe('0')
  })

  it('should truncate rather than round for boundary values', () => {
    // 0.99999 with szDecimals=3 should be 0.999, not 1
    expect(formatOrderSize(0.99999, 3)).toBe('0.999')
  })

  it('should handle large sizes', () => {
    expect(formatOrderSize(100000.12345, 2)).toBe('100000.12')
  })

  it('should not drop a lot step on sizes exactly representable at szDecimals', () => {
    // 0.29 * 100 === 28.999999999999996 — flooring the float product loses a step
    expect(formatOrderSize(0.29, 2)).toBe('0.29')
    expect(formatOrderSize(0.57, 2)).toBe('0.57')
    expect(formatOrderSize(1.005, 3)).toBe('1.005')
  })

  it('should still truncate genuinely over-precise sizes toward zero', () => {
    expect(formatOrderSize(0.2949, 2)).toBe('0.29')
    expect(formatOrderSize(0.291, 2)).toBe('0.29')
  })

  it('should truncate sub-lot dust to zero', () => {
    // 1e-7 stringifies in exponential notation
    expect(formatOrderSize(1e-7, 2)).toBe('0')
    expect(formatOrderSize(0.0000001, 4)).toBe('0')
    expect(formatOrderSize(-1e-7, 2)).toBe('0')
  })

  it('should emit plain notation for sizes at or above 1e21', () => {
    expect(formatOrderSize(1.5e21, 2)).toBe('1500000000000000000000')
  })
})

describe('formatOrderPrice', () => {
  it('should respect max price decimals based on szDecimals', () => {
    // szDecimals=2 means max 4 price decimals
    expect(formatOrderPrice(1.123456, 2)).toBe('1.1235')
  })

  it('should remove trailing zeros', () => {
    expect(formatOrderPrice(100.1, 2)).toBe('100.1')
    expect(formatOrderPrice(100.0, 2)).toBe('100')
  })

  it('should allow integer prices regardless of significant figures', () => {
    // Integer prices bypass the 5 sig-fig rule
    expect(formatOrderPrice(123456, 0)).toBe('123456')
    expect(formatOrderPrice(1000000, 2)).toBe('1000000')
  })

  it('should enforce 5 significant figures for non-integer prices', () => {
    // 12345.6 has 6 sig figs, should round to 5 → 12346
    // szDecimals=0 means max 6 price decimals
    expect(formatOrderPrice(12345.6, 0)).toBe('12346')
  })

  it('should handle BTC-like prices (high value, szDecimals=5)', () => {
    // szDecimals=5 → max 1 price decimal
    // 95000.5 → 6 sig figs → rounds to 5 → 95001
    expect(formatOrderPrice(95000.5, 5)).toBe('95001')
    // 95000.55 → rounds to 1 decimal → 95000.6 → 6 sig figs → rounds to 5 → 95001
    expect(formatOrderPrice(95000.55, 5)).toBe('95001')
    // 95000 is an integer → allowed as-is
    expect(formatOrderPrice(95000, 5)).toBe('95000')
    // 12345.6 → 6 sig figs → rounds to 5 → 12346
    expect(formatOrderPrice(12345.6, 5)).toBe('12346')
    // 1234.5 → 5 sig figs → stays as-is
    expect(formatOrderPrice(1234.5, 5)).toBe('1234.5')
  })

  it('should handle low-value asset prices', () => {
    // szDecimals=0 → max 6 price decimals
    expect(formatOrderPrice(0.001234, 0)).toBe('0.001234')
  })

  it('should handle szDecimals=0 (many price decimals allowed)', () => {
    // 1.123456 has 7 sig figs → rounds to 5 → 1.1235
    expect(formatOrderPrice(1.123456, 0)).toBe('1.1235')
  })

  it('should handle szDecimals=6 (no price decimals)', () => {
    expect(formatOrderPrice(95.7, 6)).toBe('96')
  })

  it('should handle prices that round to integers', () => {
    expect(formatOrderPrice(99.9999, 4)).toBe('100')
  })

  it('should handle very small prices with many decimals', () => {
    // szDecimals=0 → max 6 decimals, 0.000012 has 2 sig figs
    expect(formatOrderPrice(0.000012, 0)).toBe('0.000012')
  })

  it('should handle zero price', () => {
    expect(formatOrderPrice(0, 2)).toBe('0')
  })

  it('should round exact-halfway decimals half-up on the true decimal value', () => {
    // binary 1.005 is 1.00499…; Number#toFixed(2) yields '1.00'
    expect(formatOrderPrice(1.005, 4)).toBe('1.01')
    expect(formatOrderPrice(-1.005, 4)).toBe('-1.01')
  })

  it('should round exact-halfway values half-up at the 5th significant figure', () => {
    expect(formatOrderPrice(0.123455, 0)).toBe('0.12346')
  })

  it('should emit plain notation for prices at or above 1e21', () => {
    expect(formatOrderPrice(1.5e21, 0)).toBe('1500000000000000000000')
  })

  it('should never emit -0', () => {
    expect(formatOrderPrice(-0.00001, 4)).toBe('0')
  })
})
