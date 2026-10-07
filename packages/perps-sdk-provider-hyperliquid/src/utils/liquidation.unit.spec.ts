import {
  isDecimalStringGreaterThan,
  subtractDecimalString,
} from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import {
  calculateLiquidationPrice,
  calculateMaintenanceMarginRate,
  safeCalculateLiquidationPrice,
  safeCalculateMaintenanceMarginRate,
} from './liquidation.js'

describe('calculateMaintenanceMarginRate', () => {
  it('should return 1% for 50x max leverage', () => {
    expect(calculateMaintenanceMarginRate(50)).toBe('0.01')
  })

  it('should return 1.25% for 40x max leverage', () => {
    expect(calculateMaintenanceMarginRate(40)).toBe('0.0125')
  })

  it('should return 2.5% for 20x max leverage', () => {
    expect(calculateMaintenanceMarginRate(20)).toBe('0.025')
  })

  it('should return 5% for 10x max leverage', () => {
    expect(calculateMaintenanceMarginRate(10)).toBe('0.05')
  })

  it('should return 16.67% for 3x max leverage', () => {
    expect(calculateMaintenanceMarginRate(3)).toBe(
      '0.1666666666666666666666666666666666666667'
    )
  })

  it.each([
    0,
    -5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('throws a ValidationError for maxLeverage %s', (maxLeverage) => {
    expect(() => calculateMaintenanceMarginRate(maxLeverage)).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })

  it('safeCalculateMaintenanceMarginRate gives undefined and warns for zero max leverage', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeCalculateMaintenanceMarginRate(0)).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})

describe('calculateLiquidationPrice', () => {
  // BTC-like: maxLeverage=50, mmr=0.01
  it('should calculate long liquidation price for BTC at 10x', () => {
    // mmr = 0.01, marginAvail/unit = 100000*(0.1-0.01) = 9000
    // liq = 100000 - 9000 / (1 - 0.01) = 100000 - 9090.91 ≈ 90909.09
    expect(calculateLiquidationPrice('100000', '10', true, 50)).toBe(
      '90909.0909090909090909090909090909090909090909'
    )
  })

  it('should calculate short liquidation price for BTC at 10x', () => {
    // liq = 100000 + 9000 / (1 + 0.01) = 100000 + 8910.89 ≈ 108910.89
    expect(calculateLiquidationPrice('100000', '10', false, 50)).toBe(
      '108910.8910891089108910891089108910891089108911'
    )
  })

  it('should calculate long liquidation at max leverage (50x)', () => {
    // marginAvail/unit = 100000*(0.02-0.01) = 1000
    // liq = 100000 - 1000/0.99 ≈ 98989.90
    expect(calculateLiquidationPrice('100000', '50', true, 50)).toBe(
      '98989.898989898989898989898989898989898989899'
    )
  })

  it('should calculate short liquidation at max leverage (50x)', () => {
    // liq = 100000 + 1000/1.01 ≈ 100990.10
    expect(calculateLiquidationPrice('100000', '50', false, 50)).toBe(
      '100990.099009900990099009900990099009900990099'
    )
  })

  // SOL-like: maxLeverage=20, mmr=0.025
  it('should calculate long liquidation for lower max leverage asset', () => {
    // mmr = 0.025, marginAvail/unit = 150*(0.1-0.025) = 11.25
    // liq = 150 - 11.25 / (1 - 0.025) = 150 - 11.538.. ≈ 138.46
    expect(calculateLiquidationPrice('150', '10', true, 20)).toBe(
      '138.4615384615384615384615384615384615384615'
    )
  })

  it('should produce tighter liquidation at higher leverage', () => {
    const liq10x = calculateLiquidationPrice('100000', '10', true, 50)!
    const liq50x = calculateLiquidationPrice('100000', '50', true, 50)!
    // Higher leverage → liquidation closer to entry
    expect(isDecimalStringGreaterThan(liq50x, liq10x)).toBe(true)
  })

  it('should produce tighter liquidation at lower max leverage', () => {
    // Lower maxLeverage → higher mmr → less margin available
    const liq50max = calculateLiquidationPrice('100000', '10', true, 50)!
    const liq20max = calculateLiquidationPrice('100000', '10', true, 20)!
    // Higher mmr eats more margin, so liquidation is closer to entry
    expect(isDecimalStringGreaterThan(liq20max, liq50max)).toBe(true)
  })

  it('should be asymmetric between long and short', () => {
    const liqLong = calculateLiquidationPrice('100000', '10', true, 50)!
    const liqShort = calculateLiquidationPrice('100000', '10', false, 50)!
    const longDiff = subtractDecimalString('100000', liqLong)
    const shortDiff = subtractDecimalString(liqShort, '100000')
    // Due to (1 - mmr*side) denominator, long distance > short distance
    expect(isDecimalStringGreaterThan(longDiff, shortDiff)).toBe(true)
  })

  it('should return 0 for zero entry price', () => {
    expect(calculateLiquidationPrice('0', '10', true, 50)).toBe('0')
  })

  it('throws a ValidationError that names a zero leverage', () => {
    expect(() => calculateLiquidationPrice('100000', '0', true, 50)).toThrow(
      '`leverage` must not be zero.'
    )
  })

  it.each([
    0,
    -1,
    Number.NaN,
  ])('throws a ValidationError for maxLeverage %s', (maxLeverage) => {
    expect(() =>
      calculateLiquidationPrice('100000', '10', true, maxLeverage)
    ).toThrow(expect.objectContaining({ code: PerpsErrorCode.ValidationError }))
  })

  it('should handle 1x leverage long', () => {
    // mmr = 0.01, marginAvail/unit = 100000*(1-0.01) = 99000
    // liq = 100000 - 99000/0.99 = 100000 - 100000 = 0
    expect(calculateLiquidationPrice('100000', '1', true, 50)).toBe('0')
  })

  it('throws a ValidationError for a leverage that does not match the decimal pattern', () => {
    expect(() => calculateLiquidationPrice('100000', 'abc', true, 50)).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })

  it('safeCalculateLiquidationPrice gives undefined and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      safeCalculateLiquidationPrice('100000', 'abc', true, 50)
    ).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
