import { describe, expect, it } from 'vitest'
import {
  applySlippage,
  calculateNotionalValue,
  calculatePositionSize,
  calculateRealizedPnlPercent,
  calculateRequiredMargin,
  calculateRoe,
  calculateUnrealizedPnl,
  estimateFees,
} from './calculations.js'

describe('calculatePositionSize', () => {
  it('should calculate size from margin, leverage, and price', () => {
    // $1000 margin, 10x leverage, BTC at $50,000 = 0.2 BTC
    expect(calculatePositionSize(1000, 10, 50000)).toBe(0.2)
  })

  it('should scale linearly with leverage', () => {
    const size1x = calculatePositionSize(1000, 1, 50000)
    const size10x = calculatePositionSize(1000, 10, 50000)
    expect(size10x).toBe(size1x * 10)
  })

  it('should handle small margin amounts', () => {
    expect(calculatePositionSize(10, 5, 100000)).toBeCloseTo(0.0005)
  })

  it('should handle very high prices', () => {
    expect(calculatePositionSize(1000, 1, 1_000_000)).toBe(0.001)
  })

  it('should handle very low prices', () => {
    // $100 margin, 2x, price $0.001 = 200,000 units
    expect(calculatePositionSize(100, 2, 0.001)).toBe(200000)
  })

  it('should return Infinity when price is zero', () => {
    expect(calculatePositionSize(1000, 10, 0)).toBe(Infinity)
  })

  it('should return zero when margin is zero', () => {
    expect(calculatePositionSize(0, 10, 50000)).toBe(0)
  })
})

describe('calculateNotionalValue', () => {
  it('should calculate notional for positive size', () => {
    expect(calculateNotionalValue(0.5, 60000)).toBe(30000)
  })

  it('should use absolute value for negative size (short)', () => {
    expect(calculateNotionalValue(-0.5, 60000)).toBe(30000)
  })

  it('should return zero for zero size', () => {
    expect(calculateNotionalValue(0, 60000)).toBe(0)
  })

  it('should return zero for zero price', () => {
    expect(calculateNotionalValue(1, 0)).toBe(0)
  })

  it('should handle fractional sizes', () => {
    expect(calculateNotionalValue(0.001, 95000)).toBeCloseTo(95)
  })
})

describe('calculateUnrealizedPnl', () => {
  it('should calculate positive PnL for profitable long', () => {
    // Long 1 BTC, entry $50k, now $55k = +$5000
    expect(calculateUnrealizedPnl(50000, 55000, 1)).toBe(5000)
  })

  it('should calculate negative PnL for losing long', () => {
    // Long 1 BTC, entry $50k, now $45k = -$5000
    expect(calculateUnrealizedPnl(50000, 45000, 1)).toBe(-5000)
  })

  it('should calculate positive PnL for profitable short', () => {
    // Short 1 BTC (size = -1), entry $50k, now $45k = +$5000
    expect(calculateUnrealizedPnl(50000, 45000, -1)).toBe(5000)
  })

  it('should calculate negative PnL for losing short', () => {
    // Short 1 BTC (size = -1), entry $50k, now $55k = -$5000
    expect(calculateUnrealizedPnl(50000, 55000, -1)).toBe(-5000)
  })

  it('should return zero when price unchanged', () => {
    expect(calculateUnrealizedPnl(50000, 50000, 1)).toBe(0)
  })

  it('should return zero for zero size', () => {
    expect(calculateUnrealizedPnl(50000, 55000, 0)).toBe(0)
  })

  it('should scale with position size', () => {
    const pnl1 = calculateUnrealizedPnl(50000, 55000, 1)
    const pnl2 = calculateUnrealizedPnl(50000, 55000, 2)
    expect(pnl2).toBe(pnl1 * 2)
  })
})

describe('calculateRoe', () => {
  it('should calculate ROE percentage', () => {
    // $500 profit on $1000 margin = 50%
    expect(calculateRoe(500, 1000)).toBe(50)
  })

  it('should handle negative PnL', () => {
    expect(calculateRoe(-200, 1000)).toBe(-20)
  })

  it('should return zero when margin is zero', () => {
    expect(calculateRoe(500, 0)).toBe(0)
  })

  it('should handle 100% gain', () => {
    expect(calculateRoe(1000, 1000)).toBe(100)
  })

  it('should handle gains exceeding margin (leveraged)', () => {
    // 10x leverage: $10,000 profit on $1,000 margin = 1000% ROE
    expect(calculateRoe(10000, 1000)).toBe(1000)
  })

  it('should handle very small margin', () => {
    expect(calculateRoe(1, 0.01)).toBeCloseTo(10000)
  })

  it('should handle zero PnL', () => {
    expect(calculateRoe(0, 1000)).toBe(0)
  })
})

describe('calculateRequiredMargin', () => {
  it('should calculate margin from notional and leverage', () => {
    // $10,000 notional at 10x = $1,000 margin
    expect(calculateRequiredMargin(10000, 10)).toBe(1000)
  })

  it('should return full notional at 1x', () => {
    expect(calculateRequiredMargin(5000, 1)).toBe(5000)
  })

  it('should handle high leverage', () => {
    expect(calculateRequiredMargin(100000, 100)).toBe(1000)
  })

  it('should return zero for zero notional', () => {
    expect(calculateRequiredMargin(0, 10)).toBe(0)
  })

  it('should return Infinity when leverage is zero', () => {
    expect(calculateRequiredMargin(10000, 0)).toBe(Infinity)
  })
})

describe('estimateFees', () => {
  it('should calculate fee from size and rate', () => {
    // $10,000 size at 0.035% (taker) = $3.50
    expect(estimateFees(10000, 0.00035)).toBeCloseTo(3.5)
  })

  it('should return zero for zero size', () => {
    expect(estimateFees(0, 0.00035)).toBe(0)
  })

  it('should return zero for zero fee rate', () => {
    expect(estimateFees(10000, 0)).toBe(0)
  })

  it('should handle maker fee rate', () => {
    // $10,000 size at 0.01% (maker) = $1.00
    expect(estimateFees(10000, 0.0001)).toBeCloseTo(1)
  })

  it('should scale linearly with size', () => {
    const fee1 = estimateFees(10000, 0.00035)
    const fee2 = estimateFees(20000, 0.00035)
    expect(fee2).toBeCloseTo(fee1 * 2)
  })
})

describe('applySlippage', () => {
  it('should increase price for buy orders', () => {
    // 0.5% slippage on $100 buy = $100.50
    expect(applySlippage(100, 0.5, true)).toBeCloseTo(100.5)
  })

  it('should decrease price for sell orders', () => {
    // 0.5% slippage on $100 sell = ~$99.50
    expect(applySlippage(100, 0.5, false)).toBeCloseTo(99.5024, 2)
  })

  it('should return original price with zero slippage', () => {
    expect(applySlippage(50000, 0, true)).toBe(50000)
    expect(applySlippage(50000, 0, false)).toBe(50000)
  })

  it('should handle large slippage percentage', () => {
    // 5% slippage on buy
    expect(applySlippage(100, 5, true)).toBe(105)
  })

  it('should be asymmetric (buy slippage > sell slippage in absolute terms)', () => {
    const buyPrice = applySlippage(100, 1, true)
    const sellPrice = applySlippage(100, 1, false)
    // Buy: 100 * 1.01 = 101, difference = 1
    // Sell: 100 / 1.01 ≈ 99.0099, difference ≈ 0.99
    expect(buyPrice - 100).toBeGreaterThan(100 - sellPrice)
  })

  it('should handle very small prices', () => {
    const result = applySlippage(0.00001, 0.5, true)
    expect(result).toBeGreaterThan(0.00001)
  })
})

describe('calculateRealizedPnlPercent', () => {
  it('should calculate positive PnL percentage', () => {
    // $50 profit on 1 unit at $500 = 10%
    expect(calculateRealizedPnlPercent(50, 1, 500)).toBeCloseTo(10)
  })

  it('should calculate negative PnL percentage', () => {
    expect(calculateRealizedPnlPercent(-25, 0.5, 1000)).toBeCloseTo(-5)
  })

  it('should return zero for zero position value', () => {
    expect(calculateRealizedPnlPercent(100, 0, 1000)).toBe(0)
    expect(calculateRealizedPnlPercent(100, 1, 0)).toBe(0)
  })

  it('should use absolute size for negative sizes', () => {
    expect(calculateRealizedPnlPercent(50, -1, 500)).toBeCloseTo(10)
  })
})
