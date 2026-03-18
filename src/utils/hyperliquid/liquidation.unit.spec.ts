import { describe, expect, it } from 'vitest'
import {
  calculateLiquidationPrice,
  calculateMaintenanceMarginRate,
} from './liquidation.js'

describe('calculateMaintenanceMarginRate', () => {
  it('should return 1% for 50x max leverage', () => {
    expect(calculateMaintenanceMarginRate(50)).toBe(0.01)
  })

  it('should return 1.25% for 40x max leverage', () => {
    expect(calculateMaintenanceMarginRate(40)).toBe(0.0125)
  })

  it('should return 2.5% for 20x max leverage', () => {
    expect(calculateMaintenanceMarginRate(20)).toBe(0.025)
  })

  it('should return 5% for 10x max leverage', () => {
    expect(calculateMaintenanceMarginRate(10)).toBe(0.05)
  })

  it('should return 16.67% for 3x max leverage', () => {
    expect(calculateMaintenanceMarginRate(3)).toBeCloseTo(0.16667, 4)
  })

  it('should return undefined for zero max leverage', () => {
    expect(calculateMaintenanceMarginRate(0)).toBeUndefined()
  })
})

describe('calculateLiquidationPrice', () => {
  // BTC-like: maxLeverage=50, mmr=0.01
  it('should calculate long liquidation price for BTC at 10x', () => {
    // mmr = 0.01, marginAvail/unit = 100000*(0.1-0.01) = 9000
    // liq = 100000 - 9000 / (1 - 0.01) = 100000 - 9090.91 ≈ 90909.09
    const result = calculateLiquidationPrice(100000, 10, true, 50)
    expect(result).toBeCloseTo(90909.09, 0)
  })

  it('should calculate short liquidation price for BTC at 10x', () => {
    // liq = 100000 + 9000 / (1 + 0.01) = 100000 + 8910.89 ≈ 108910.89
    const result = calculateLiquidationPrice(100000, 10, false, 50)
    expect(result).toBeCloseTo(108910.89, 0)
  })

  it('should calculate long liquidation at max leverage (50x)', () => {
    // marginAvail/unit = 100000*(0.02-0.01) = 1000
    // liq = 100000 - 1000/0.99 ≈ 98989.90
    const result = calculateLiquidationPrice(100000, 50, true, 50)
    expect(result).toBeCloseTo(98989.9, 0)
  })

  it('should calculate short liquidation at max leverage (50x)', () => {
    // liq = 100000 + 1000/1.01 ≈ 100990.10
    const result = calculateLiquidationPrice(100000, 50, false, 50)
    expect(result).toBeCloseTo(100990.1, 0)
  })

  // SOL-like: maxLeverage=20, mmr=0.025
  it('should calculate long liquidation for lower max leverage asset', () => {
    // mmr = 0.025, marginAvail/unit = 150*(0.1-0.025) = 11.25
    // liq = 150 - 11.25 / (1 - 0.025) = 150 - 11.538.. ≈ 138.46
    const result = calculateLiquidationPrice(150, 10, true, 20)
    expect(result).toBeCloseTo(138.46, 0)
  })

  it('should produce tighter liquidation at higher leverage', () => {
    const liq10x = calculateLiquidationPrice(100000, 10, true, 50)!
    const liq50x = calculateLiquidationPrice(100000, 50, true, 50)!
    // Higher leverage → liquidation closer to entry
    expect(liq50x).toBeGreaterThan(liq10x)
  })

  it('should produce tighter liquidation at lower max leverage', () => {
    // Lower maxLeverage → higher mmr → less margin available
    const liq50max = calculateLiquidationPrice(100000, 10, true, 50)!
    const liq20max = calculateLiquidationPrice(100000, 10, true, 20)!
    // Higher mmr eats more margin, so liquidation is closer to entry
    expect(liq20max).toBeGreaterThan(liq50max)
  })

  it('should be asymmetric between long and short', () => {
    const liqLong = calculateLiquidationPrice(100000, 10, true, 50)!
    const liqShort = calculateLiquidationPrice(100000, 10, false, 50)!
    const longDiff = 100000 - liqLong
    const shortDiff = liqShort - 100000
    // Due to (1 - mmr*side) denominator, long distance > short distance
    expect(longDiff).toBeGreaterThan(shortDiff)
  })

  it('should return 0 for zero entry price', () => {
    expect(calculateLiquidationPrice(0, 10, true, 50)).toBe(0)
  })

  it('should return undefined for zero leverage', () => {
    expect(calculateLiquidationPrice(100000, 0, true, 50)).toBeUndefined()
  })

  it('should return undefined for zero max leverage', () => {
    expect(calculateLiquidationPrice(100000, 10, true, 0)).toBeUndefined()
  })

  it('should handle 1x leverage long', () => {
    // mmr = 0.01, marginAvail/unit = 100000*(1-0.01) = 99000
    // liq = 100000 - 99000/0.99 = 100000 - 100000 = 0
    const result = calculateLiquidationPrice(100000, 1, true, 50)
    expect(result).toBeCloseTo(0, 0)
  })
})
