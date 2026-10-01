import { describe, expect, it } from 'vitest'
import {
  directionSign,
  estimateIsolatedLiquidationPrice,
  predictAverageEntryPrice,
  predictNewLeverage,
  predictUnrealizedPnl,
  realizedPnlOnClose,
} from './positionMath.js'

describe('directionSign', () => {
  it('returns +1 for long', () => {
    expect(directionSign(true)).toBe(1)
  })
  it('returns -1 for short', () => {
    expect(directionSign(false)).toBe(-1)
  })
})

describe('estimateIsolatedLiquidationPrice', () => {
  it('estimates a long liquidation below entry', () => {
    // entry * (1 - 1/leverage) / (1 - mmr) = 100 * 0.9 / 0.99
    const liq = estimateIsolatedLiquidationPrice({
      entryPrice: 100,
      leverage: 10,
      isLong: true,
      maintenanceMarginRate: 0.01,
    })
    expect(liq).toBeCloseTo(90.90909, 4)
  })

  it('estimates a short liquidation above entry', () => {
    // entry * (1 + 1/leverage) / (1 + mmr) = 100 * 1.1 / 1.01
    const liq = estimateIsolatedLiquidationPrice({
      entryPrice: 100,
      leverage: 10,
      isLong: false,
      maintenanceMarginRate: 0.01,
    })
    expect(liq).toBeCloseTo(108.91089, 4)
  })

  it('returns undefined for zero leverage', () => {
    expect(
      estimateIsolatedLiquidationPrice({
        entryPrice: 100,
        leverage: 0,
        isLong: true,
        maintenanceMarginRate: 0.01,
      })
    ).toBeUndefined()
  })

  it('returns undefined for a degenerate denominator', () => {
    expect(
      estimateIsolatedLiquidationPrice({
        entryPrice: 100,
        leverage: 10,
        isLong: true,
        maintenanceMarginRate: 1,
      })
    ).toBeUndefined()
  })
})

describe('predictAverageEntryPrice', () => {
  it('weighted-averages current and new fill price', () => {
    // 1 BTC @ 100, add 1 BTC @ 200 => 150
    const avg = predictAverageEntryPrice({
      currentSize: 1,
      currentEntry: 100,
      addSize: 1,
      fillPrice: 200,
    })
    expect(avg).toBeCloseTo(150, 9)
  })

  it('weights by size, not by USD', () => {
    // 3 BTC @ 100, add 1 BTC @ 200 => (3*100 + 1*200)/4 = 125
    const avg = predictAverageEntryPrice({
      currentSize: 3,
      currentEntry: 100,
      addSize: 1,
      fillPrice: 200,
    })
    expect(avg).toBeCloseTo(125, 9)
  })

  it('returns the fill price when there is no existing size', () => {
    const avg = predictAverageEntryPrice({
      currentSize: 0,
      currentEntry: 0,
      addSize: 2,
      fillPrice: 50,
    })
    expect(avg).toBeCloseTo(50, 9)
  })

  it('returns the current entry when add size is zero', () => {
    const avg = predictAverageEntryPrice({
      currentSize: 5,
      currentEntry: 123.45,
      addSize: 0,
      fillPrice: 999,
    })
    expect(avg).toBeCloseTo(123.45, 9)
  })

  it('returns undefined when both sizes are zero', () => {
    const avg = predictAverageEntryPrice({
      currentSize: 0,
      currentEntry: 0,
      addSize: 0,
      fillPrice: 0,
    })
    expect(avg).toBeUndefined()
  })

  it('returns undefined when prices are non-finite', () => {
    expect(
      predictAverageEntryPrice({
        currentSize: 1,
        currentEntry: NaN,
        addSize: 1,
        fillPrice: 100,
      })
    ).toBeUndefined()
    expect(
      predictAverageEntryPrice({
        currentSize: 1,
        currentEntry: 100,
        addSize: 1,
        fillPrice: Number.POSITIVE_INFINITY,
      })
    ).toBeUndefined()
  })
})

describe('predictNewLeverage', () => {
  it('recomputes leverage from combined notional and margin', () => {
    // current 10x: $1000 notional / $100 margin
    // add: $500 notional / $50 margin (also 10x)
    // total: $1500 / $150 = 10x
    const lev = predictNewLeverage({
      currentNotional: 1000,
      currentMargin: 100,
      addNotional: 500,
      addMargin: 50,
    })
    expect(lev).toBeCloseTo(10, 9)
  })

  it('blends differing leverages correctly', () => {
    // current 5x: $500 / $100, add 20x: $400 / $20
    // total: $900 / $120 = 7.5x
    const lev = predictNewLeverage({
      currentNotional: 500,
      currentMargin: 100,
      addNotional: 400,
      addMargin: 20,
    })
    expect(lev).toBeCloseTo(7.5, 9)
  })

  it('returns undefined when total margin is non-positive', () => {
    expect(
      predictNewLeverage({
        currentNotional: 0,
        currentMargin: 0,
        addNotional: 0,
        addMargin: 0,
      })
    ).toBeUndefined()
  })
})

describe('predictUnrealizedPnl', () => {
  it('positive for long when mark > entry', () => {
    const pnl = predictUnrealizedPnl({
      entryPrice: 100,
      markPrice: 110,
      size: 2,
      isLong: true,
    })
    expect(pnl).toBeCloseTo(20, 9)
  })

  it('negative for long when mark < entry', () => {
    const pnl = predictUnrealizedPnl({
      entryPrice: 100,
      markPrice: 90,
      size: 2,
      isLong: true,
    })
    expect(pnl).toBeCloseTo(-20, 9)
  })

  it('positive for short when mark < entry', () => {
    const pnl = predictUnrealizedPnl({
      entryPrice: 100,
      markPrice: 90,
      size: 2,
      isLong: false,
    })
    expect(pnl).toBeCloseTo(20, 9)
  })

  it('negative for short when mark > entry', () => {
    const pnl = predictUnrealizedPnl({
      entryPrice: 100,
      markPrice: 110,
      size: 2,
      isLong: false,
    })
    expect(pnl).toBeCloseTo(-20, 9)
  })

  it('zero when mark equals entry', () => {
    expect(
      predictUnrealizedPnl({
        entryPrice: 100,
        markPrice: 100,
        size: 5,
        isLong: true,
      })
    ).toBeCloseTo(0, 9)
  })
})

describe('realizedPnlOnClose', () => {
  it('locks in profit on a winning long close', () => {
    // 1 BTC long @ 100, close at 150 => +50
    const r = realizedPnlOnClose({
      entryPrice: 100,
      closePrice: 150,
      closeSize: 1,
      isLong: true,
    })
    expect(r).toBeCloseTo(50, 9)
  })

  it('locks in loss on a losing long close', () => {
    const r = realizedPnlOnClose({
      entryPrice: 100,
      closePrice: 80,
      closeSize: 2,
      isLong: true,
    })
    expect(r).toBeCloseTo(-40, 9)
  })

  it('locks in profit on a winning short close', () => {
    // 2 BTC short @ 100, close at 80 => +40
    const r = realizedPnlOnClose({
      entryPrice: 100,
      closePrice: 80,
      closeSize: 2,
      isLong: false,
    })
    expect(r).toBeCloseTo(40, 9)
  })

  it('locks in loss on a losing short close', () => {
    const r = realizedPnlOnClose({
      entryPrice: 100,
      closePrice: 120,
      closeSize: 1,
      isLong: false,
    })
    expect(r).toBeCloseTo(-20, 9)
  })
})

describe('exact decimal results', () => {
  it('predictUnrealizedPnl', () => {
    expect(
      predictUnrealizedPnl({
        entryPrice: 0.1,
        markPrice: 0.3,
        size: 1,
        isLong: true,
      })
    ).toBe(0.2)
  })

  it('realizedPnlOnClose', () => {
    expect(
      realizedPnlOnClose({
        entryPrice: 0.1,
        closePrice: 0.3,
        closeSize: 2,
        isLong: false,
      })
    ).toBe(-0.4)
  })

  it('predictAverageEntryPrice', () => {
    expect(
      predictAverageEntryPrice({
        currentSize: 0.1,
        currentEntry: 0.7,
        addSize: 0.2,
        fillPrice: 0.7,
      })
    ).toBe(0.7)
  })

  it('predictNewLeverage', () => {
    expect(
      predictNewLeverage({
        currentNotional: 0.1,
        currentMargin: 0.1,
        addNotional: 0.2,
        addMargin: 0.1,
      })
    ).toBe(1.5)
    expect(
      predictNewLeverage({
        currentNotional: 0.7,
        currentMargin: 0.1,
        addNotional: 0.2,
        addMargin: 0.2,
      })
    ).toBe(3)
  })

  it('estimateIsolatedLiquidationPrice', () => {
    expect(
      estimateIsolatedLiquidationPrice({
        entryPrice: 0.3,
        leverage: 10,
        isLong: false,
        maintenanceMarginRate: 0.02,
      })
    ).toBe(0.3235294117647059)
    expect(
      estimateIsolatedLiquidationPrice({
        entryPrice: 1.1,
        leverage: 20,
        isLong: false,
        maintenanceMarginRate: 0.01,
      })
    ).toBe(1.1435643564356435)
  })
})

describe('non-finite inputs', () => {
  const nonFinite = [Number.NaN, Number.POSITIVE_INFINITY]

  it.each(nonFinite)('gives back NaN for %s and does not throw', (bad) => {
    expect(
      estimateIsolatedLiquidationPrice({
        entryPrice: bad,
        leverage: 10,
        isLong: true,
        maintenanceMarginRate: 0.01,
      })
    ).toBeNaN()
    expect(
      predictAverageEntryPrice({
        currentSize: bad,
        currentEntry: 100,
        addSize: 1,
        fillPrice: 100,
      })
    ).toBeNaN()
    expect(
      predictNewLeverage({
        currentNotional: bad,
        currentMargin: 1,
        addNotional: 1,
        addMargin: 1,
      })
    ).toBeNaN()
    expect(
      predictUnrealizedPnl({
        entryPrice: bad,
        markPrice: 1,
        size: 1,
        isLong: true,
      })
    ).toBeNaN()
    expect(
      realizedPnlOnClose({
        entryPrice: bad,
        closePrice: 1,
        closeSize: 1,
        isLong: true,
      })
    ).toBeNaN()
  })
})
