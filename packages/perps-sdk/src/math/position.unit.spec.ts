import {
  MarginMode,
  PerpsErrorCode,
  type PerpsMarket,
  type Position,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import {
  calculateEffectiveLeverage,
  calculateLiquidationDistance,
  calculateNotionalValue,
  calculateRealizedPnl,
  calculateRequiredMargin,
  calculateRoe,
  calculateUnrealizedPnl,
  estimateAverageEntryPrice,
  estimateLiquidationPrice,
  estimateLiquidationPriceAtMarketRate,
  estimateNewLeverage,
  estimateUnrealizedPnl,
  positionSupportsMarginAdjustment,
  positionSupportsMarginRemoval,
  safeCalculateEffectiveLeverage,
  safeCalculateLiquidationDistance,
  safeCalculateNotionalValue,
  safeCalculateRealizedPnl,
  safeCalculateRequiredMargin,
  safeCalculateRoe,
  safeCalculateUnrealizedPnl,
  safeEstimateAverageEntryPrice,
  safeEstimateLiquidationPrice,
  safeEstimateNewLeverage,
  safeEstimateUnrealizedPnl,
  safeWouldImmediatelyLiquidate,
  wouldImmediatelyLiquidate,
} from './position.js'

describe('calculateNotionalValue', () => {
  it('should calculate notional for positive size', () => {
    expect(calculateNotionalValue('0.5', '60000')).toBe('30000')
  })

  it('should use absolute value for negative size (short)', () => {
    expect(calculateNotionalValue('-0.5', '60000')).toBe('30000')
  })

  it('should return zero for zero size', () => {
    expect(calculateNotionalValue('0', '60000')).toBe('0')
  })

  it('should return zero for zero price', () => {
    expect(calculateNotionalValue('1', '0')).toBe('0')
  })

  it('should handle fractional sizes', () => {
    expect(calculateNotionalValue('0.001', '95000')).toBe('95')
  })
})

describe('calculateUnrealizedPnl', () => {
  it('should calculate positive PnL for profitable long', () => {
    // Long 1 BTC, entry $50k, now $55k = +$5000
    expect(calculateUnrealizedPnl('50000', '55000', '1')).toBe('5000')
  })

  it('should calculate negative PnL for losing long', () => {
    // Long 1 BTC, entry $50k, now $45k = -$5000
    expect(calculateUnrealizedPnl('50000', '45000', '1')).toBe('-5000')
  })

  it('should calculate positive PnL for profitable short', () => {
    // Short 1 BTC (size = -1), entry $50k, now $45k = +$5000
    expect(calculateUnrealizedPnl('50000', '45000', '-1')).toBe('5000')
  })

  it('should calculate negative PnL for losing short', () => {
    // Short 1 BTC (size = -1), entry $50k, now $55k = -$5000
    expect(calculateUnrealizedPnl('50000', '55000', '-1')).toBe('-5000')
  })

  it('should return zero when price unchanged', () => {
    expect(calculateUnrealizedPnl('50000', '50000', '1')).toBe('0')
  })

  it('should return zero for zero size', () => {
    expect(calculateUnrealizedPnl('50000', '55000', '0')).toBe('0')
  })

  it('should scale with position size', () => {
    expect(calculateUnrealizedPnl('50000', '55000', '1')).toBe('5000')
    expect(calculateUnrealizedPnl('50000', '55000', '2')).toBe('10000')
  })
})

describe('calculateRoe', () => {
  it('should calculate ROE percentage', () => {
    // $500 profit on $1000 margin = 50%
    expect(calculateRoe('500', '1000')).toBe('50')
  })

  it('should handle negative PnL', () => {
    expect(calculateRoe('-200', '1000')).toBe('-20')
  })

  it('should return zero when margin is zero', () => {
    expect(calculateRoe('500', '0')).toBe('0')
  })

  it('should handle 100% gain', () => {
    expect(calculateRoe('1000', '1000')).toBe('100')
  })

  it('should handle gains exceeding margin (leveraged)', () => {
    // 10x leverage: $10,000 profit on $1,000 margin = 1000% ROE
    expect(calculateRoe('10000', '1000')).toBe('1000')
  })

  it('should handle very small margin', () => {
    expect(calculateRoe('1', '0.01')).toBe('10000')
  })

  it('should handle zero PnL', () => {
    expect(calculateRoe('0', '1000')).toBe('0')
  })
})

describe('calculateRequiredMargin', () => {
  it('should calculate margin from notional and leverage', () => {
    // $10,000 notional at 10x = $1,000 margin
    expect(calculateRequiredMargin('10000', '10')).toBe('1000')
  })

  it('should return full notional at 1x', () => {
    expect(calculateRequiredMargin('5000', '1')).toBe('5000')
  })

  it('should handle high leverage', () => {
    expect(calculateRequiredMargin('100000', '100')).toBe('1000')
  })

  it('should return zero for zero notional', () => {
    expect(calculateRequiredMargin('0', '10')).toBe('0')
  })

  it('throws a ValidationError when leverage is zero', () => {
    expect(() => calculateRequiredMargin('10000', '0')).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})

describe('calculateLiquidationDistance', () => {
  it('should calculate distance for a long below current price', () => {
    // liq $45k, current $50k = 10% away
    expect(
      calculateLiquidationDistance({
        liquidationPrice: '45000',
        currentPrice: '50000',
      })
    ).toBe('10')
  })

  it('should calculate distance for a short above current price', () => {
    // liq $55k, current $50k = 10% away
    expect(
      calculateLiquidationDistance({
        liquidationPrice: '55000',
        currentPrice: '50000',
      })
    ).toBe('10')
  })

  it('should return zero when prices are equal', () => {
    expect(
      calculateLiquidationDistance({
        liquidationPrice: '50000',
        currentPrice: '50000',
      })
    ).toBe('0')
  })

  it('should return zero when current price is zero', () => {
    expect(
      calculateLiquidationDistance({
        liquidationPrice: '45000',
        currentPrice: '0',
      })
    ).toBe('0')
  })

  it('should return zero when liquidation price is zero', () => {
    // No liquidation price yet (e.g. unset) reads as 100% away, not a guard case
    expect(
      calculateLiquidationDistance({
        liquidationPrice: '0',
        currentPrice: '50000',
      })
    ).toBe('100')
  })
})

describe('calculateEffectiveLeverage', () => {
  it('should calculate leverage from notional and margin', () => {
    // $10,000 notional on $1,000 margin = 10x
    expect(
      calculateEffectiveLeverage({
        positionValueUsd: '10000',
        marginUsd: '1000',
      })
    ).toBe('10')
  })

  it('should return 1x when notional equals margin', () => {
    expect(
      calculateEffectiveLeverage({
        positionValueUsd: '5000',
        marginUsd: '5000',
      })
    ).toBe('1')
  })

  it('should return zero when margin is zero', () => {
    expect(
      calculateEffectiveLeverage({ positionValueUsd: '10000', marginUsd: '0' })
    ).toBe('0')
  })

  it('should return zero for zero notional', () => {
    expect(
      calculateEffectiveLeverage({ positionValueUsd: '0', marginUsd: '1000' })
    ).toBe('0')
  })

  it('should handle negative margin', () => {
    // A liquidated/underwater position can report negative margin; the sign
    // carries through rather than being guarded.
    expect(
      calculateEffectiveLeverage({
        positionValueUsd: '10000',
        marginUsd: '-1000',
      })
    ).toBe('-10')
  })
})

describe('estimateLiquidationPrice', () => {
  it('estimates a long liquidation below entry', () => {
    // entry * (1 - 1/leverage) / (1 - mmr) = 100 * 0.9 / 0.99
    const liq = estimateLiquidationPrice({
      entryPrice: '100',
      leverage: '10',
      isLong: true,
      maintenanceMarginRate: '0.01',
    })
    expect(liq).toBe('90.9090909090909090909090909090909090909091')
  })

  it('estimates a short liquidation above entry', () => {
    // entry * (1 + 1/leverage) / (1 + mmr) = 100 * 1.1 / 1.01
    const liq = estimateLiquidationPrice({
      entryPrice: '100',
      leverage: '10',
      isLong: false,
      maintenanceMarginRate: '0.01',
    })
    expect(liq).toBe('108.9108910891089108910891089108910891089109')
  })

  it('returns undefined for zero leverage', () => {
    expect(
      estimateLiquidationPrice({
        entryPrice: '100',
        leverage: '0',
        isLong: true,
        maintenanceMarginRate: '0.01',
      })
    ).toBeUndefined()
  })

  it('returns undefined for a degenerate denominator', () => {
    expect(
      estimateLiquidationPrice({
        entryPrice: '100',
        leverage: '10',
        isLong: true,
        maintenanceMarginRate: '1',
      })
    ).toBeUndefined()
  })
})

describe('estimateLiquidationPriceAtMarketRate', () => {
  const market = (overrides: Partial<PerpsMarket>): PerpsMarket => ({
    providerId: 'lighter',
    id: '1',
    categoryId: 'lighter',
    baseAsset: {
      providerId: 'lighter',
      id: '1',
      displaySymbol: 'BTC',
      logoURI: '',
    },
    quoteAsset: {
      providerId: 'lighter',
      id: 'USDC',
      displaySymbol: 'USDC',
      logoURI: '',
    },
    szDecimals: 5,
    priceDecimals: 1,
    maxLeverage: 50,
    onlyIsolated: false,
    positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
    maintenanceMarginRate: 0.012,
    ...overrides,
  })

  it('estimates a long liquidation from the market maintenance margin rate', () => {
    // entry * (1 - 1/leverage) / (1 - mmr) = 61729.6 * 0.9 / 0.988
    const liq = estimateLiquidationPriceAtMarketRate(market({}), {
      entryPrice: '61729.6',
      leverage: '10',
      isLong: true,
    })
    expect(Number(liq)).toBeCloseTo(56231.417, 2)
  })

  it('estimates a short liquidation from the market maintenance margin rate', () => {
    // entry * (1 + 1/leverage) / (1 + mmr) = 61729.6 * 1.1 / 1.012
    const liq = estimateLiquidationPriceAtMarketRate(market({}), {
      entryPrice: '61729.6',
      leverage: '10',
      isLong: false,
    })
    expect(Number(liq)).toBeCloseTo(67097.391, 2)
  })

  it('gives an exact result for a market with a round rate', () => {
    // entry * (1 - 1/leverage) / (1 - mmr) = 95 * 0.9 / 0.95
    expect(
      estimateLiquidationPriceAtMarketRate(
        market({ maintenanceMarginRate: 0.05 }),
        { entryPrice: '95', leverage: '10', isLong: true }
      )
    ).toBe('90')
  })

  it('returns undefined when the market carries no maintenanceMarginRate', () => {
    expect(
      estimateLiquidationPriceAtMarketRate(
        market({ maintenanceMarginRate: undefined }),
        { entryPrice: '61729.6', leverage: '10', isLong: true }
      )
    ).toBeUndefined()
  })

  it('returns undefined for zero leverage', () => {
    expect(
      estimateLiquidationPriceAtMarketRate(market({}), {
        entryPrice: '61729.6',
        leverage: '0',
        isLong: true,
      })
    ).toBeUndefined()
  })
})

describe('estimateAverageEntryPrice', () => {
  it('weighted-averages current and new fill price', () => {
    // 1 BTC @ 100, add 1 BTC @ 200 => 150
    const avg = estimateAverageEntryPrice({
      currentSize: '1',
      currentEntry: '100',
      addSize: '1',
      fillPrice: '200',
    })
    expect(avg).toBe('150')
  })

  it('weights by size, not by USD', () => {
    // 3 BTC @ 100, add 1 BTC @ 200 => (3*100 + 1*200)/4 = 125
    const avg = estimateAverageEntryPrice({
      currentSize: '3',
      currentEntry: '100',
      addSize: '1',
      fillPrice: '200',
    })
    expect(avg).toBe('125')
  })

  it('returns the fill price when there is no existing size', () => {
    const avg = estimateAverageEntryPrice({
      currentSize: '0',
      currentEntry: '0',
      addSize: '2',
      fillPrice: '50',
    })
    expect(avg).toBe('50')
  })

  it('returns the current entry when add size is zero', () => {
    const avg = estimateAverageEntryPrice({
      currentSize: '5',
      currentEntry: '123.45',
      addSize: '0',
      fillPrice: '999',
    })
    expect(avg).toBe('123.45')
  })

  it('returns undefined when both sizes are zero', () => {
    const avg = estimateAverageEntryPrice({
      currentSize: '0',
      currentEntry: '0',
      addSize: '0',
      fillPrice: '0',
    })
    expect(avg).toBeUndefined()
  })

  it.each([
    { currentEntry: 'NaN', fillPrice: '100' },
    { currentEntry: '100', fillPrice: 'Infinity' },
  ])('throws a ValidationError for a non-decimal price ($currentEntry, $fillPrice)', (prices) => {
    expect(() =>
      estimateAverageEntryPrice({ currentSize: '1', addSize: '1', ...prices })
    ).toThrow(expect.objectContaining({ code: PerpsErrorCode.ValidationError }))
  })
})

describe('estimateNewLeverage', () => {
  it('recomputes leverage from combined notional and margin', () => {
    // current 10x: $1000 notional / $100 margin
    // add: $500 notional / $50 margin (also 10x)
    // total: $1500 / $150 = 10x
    const lev = estimateNewLeverage({
      currentNotional: '1000',
      currentMargin: '100',
      addNotional: '500',
      addMargin: '50',
    })
    expect(lev).toBe('10')
  })

  it('blends differing leverages correctly', () => {
    // current 5x: $500 / $100, add 20x: $400 / $20
    // total: $900 / $120 = 7.5x
    const lev = estimateNewLeverage({
      currentNotional: '500',
      currentMargin: '100',
      addNotional: '400',
      addMargin: '20',
    })
    expect(lev).toBe('7.5')
  })

  it('returns undefined when total margin is non-positive', () => {
    expect(
      estimateNewLeverage({
        currentNotional: '0',
        currentMargin: '0',
        addNotional: '0',
        addMargin: '0',
      })
    ).toBeUndefined()
  })
})

describe('estimateUnrealizedPnl', () => {
  it('positive for long when mark > entry', () => {
    const pnl = estimateUnrealizedPnl({
      entryPrice: '100',
      markPrice: '110',
      size: '2',
      isLong: true,
    })
    expect(pnl).toBe('20')
  })

  it('negative for long when mark < entry', () => {
    const pnl = estimateUnrealizedPnl({
      entryPrice: '100',
      markPrice: '90',
      size: '2',
      isLong: true,
    })
    expect(pnl).toBe('-20')
  })

  it('positive for short when mark < entry', () => {
    const pnl = estimateUnrealizedPnl({
      entryPrice: '100',
      markPrice: '90',
      size: '2',
      isLong: false,
    })
    expect(pnl).toBe('20')
  })

  it('negative for short when mark > entry', () => {
    const pnl = estimateUnrealizedPnl({
      entryPrice: '100',
      markPrice: '110',
      size: '2',
      isLong: false,
    })
    expect(pnl).toBe('-20')
  })

  it('zero when mark equals entry', () => {
    expect(
      estimateUnrealizedPnl({
        entryPrice: '100',
        markPrice: '100',
        size: '5',
        isLong: true,
      })
    ).toBe('0')
  })
})

describe('calculateRealizedPnl', () => {
  it('locks in profit on a winning long close', () => {
    // 1 BTC long @ 100, close at 150 => +50
    const r = calculateRealizedPnl({
      entryPrice: '100',
      closePrice: '150',
      closeSize: '1',
      isLong: true,
    })
    expect(r).toBe('50')
  })

  it('locks in loss on a losing long close', () => {
    const r = calculateRealizedPnl({
      entryPrice: '100',
      closePrice: '80',
      closeSize: '2',
      isLong: true,
    })
    expect(r).toBe('-40')
  })

  it('locks in profit on a winning short close', () => {
    // 2 BTC short @ 100, close at 80 => +40
    const r = calculateRealizedPnl({
      entryPrice: '100',
      closePrice: '80',
      closeSize: '2',
      isLong: false,
    })
    expect(r).toBe('40')
  })

  it('locks in loss on a losing short close', () => {
    const r = calculateRealizedPnl({
      entryPrice: '100',
      closePrice: '120',
      closeSize: '1',
      isLong: false,
    })
    expect(r).toBe('-20')
  })
})

describe('exact decimal results', () => {
  it('calculateNotionalValue', () => {
    expect(calculateNotionalValue('0.1', '3')).toBe('0.3')
    expect(calculateNotionalValue('-0.1', '3')).toBe('0.3')
  })

  it('calculateUnrealizedPnl', () => {
    expect(calculateUnrealizedPnl('0.1', '0.3', '1')).toBe('0.2')
  })

  it('calculateRoe', () => {
    expect(calculateRoe('0.3', '0.1')).toBe('300')
  })

  it('calculateRequiredMargin', () => {
    expect(calculateRequiredMargin('0.3', '3')).toBe('0.1')
  })

  it('calculateEffectiveLeverage', () => {
    expect(
      calculateEffectiveLeverage({ positionValueUsd: '0.3', marginUsd: '0.1' })
    ).toBe('3')
    expect(
      calculateEffectiveLeverage({ positionValueUsd: '0.7', marginUsd: '0.1' })
    ).toBe('7')
  })

  it('estimateUnrealizedPnl', () => {
    expect(
      estimateUnrealizedPnl({
        entryPrice: '0.1',
        markPrice: '0.3',
        size: '1',
        isLong: true,
      })
    ).toBe('0.2')
  })

  it('calculateRealizedPnl', () => {
    expect(
      calculateRealizedPnl({
        entryPrice: '0.1',
        closePrice: '0.3',
        closeSize: '2',
        isLong: false,
      })
    ).toBe('-0.4')
  })

  it('estimateAverageEntryPrice', () => {
    expect(
      estimateAverageEntryPrice({
        currentSize: '0.1',
        currentEntry: '0.7',
        addSize: '0.2',
        fillPrice: '0.7',
      })
    ).toBe('0.7')
  })

  it('estimateNewLeverage', () => {
    expect(
      estimateNewLeverage({
        currentNotional: '0.1',
        currentMargin: '0.1',
        addNotional: '0.2',
        addMargin: '0.1',
      })
    ).toBe('1.5')
    expect(
      estimateNewLeverage({
        currentNotional: '0.7',
        currentMargin: '0.1',
        addNotional: '0.2',
        addMargin: '0.2',
      })
    ).toBe('3')
  })

  it('estimateLiquidationPrice', () => {
    expect(
      estimateLiquidationPrice({
        entryPrice: '0.3',
        leverage: '10',
        isLong: false,
        maintenanceMarginRate: '0.02',
      })
    ).toBe('0.3235294117647058823529411764705882352941')
    expect(
      estimateLiquidationPrice({
        entryPrice: '1.1',
        leverage: '20',
        isLong: false,
        maintenanceMarginRate: '0.01',
      })
    ).toBe('1.1435643564356435643564356435643564356436')
  })
})

describe('non-decimal inputs', () => {
  it.each([
    'NaN',
    'Infinity',
    'abc',
  ])('throws a ValidationError for %s', (bad) => {
    const validationError = expect.objectContaining({
      code: PerpsErrorCode.ValidationError,
    })
    expect(() => calculateNotionalValue(bad, '1')).toThrow(validationError)
    expect(() => calculateUnrealizedPnl('1', bad, '1')).toThrow(validationError)
    expect(() => calculateRoe(bad, '1')).toThrow(validationError)
    expect(() => calculateRequiredMargin(bad, '2')).toThrow(validationError)
    expect(() =>
      calculateLiquidationDistance({ liquidationPrice: bad, currentPrice: '1' })
    ).toThrow(validationError)
    expect(() =>
      calculateEffectiveLeverage({ positionValueUsd: bad, marginUsd: '1' })
    ).toThrow(validationError)
    expect(() =>
      estimateLiquidationPrice({
        entryPrice: bad,
        leverage: '10',
        isLong: true,
        maintenanceMarginRate: '0.01',
      })
    ).toThrow(validationError)
    expect(() =>
      estimateAverageEntryPrice({
        currentSize: bad,
        currentEntry: '100',
        addSize: '1',
        fillPrice: '100',
      })
    ).toThrow(validationError)
    expect(() =>
      estimateNewLeverage({
        currentNotional: bad,
        currentMargin: '1',
        addNotional: '1',
        addMargin: '1',
      })
    ).toThrow(validationError)
    expect(() =>
      estimateUnrealizedPnl({
        entryPrice: bad,
        markPrice: '1',
        size: '1',
        isLong: true,
      })
    ).toThrow(validationError)
    expect(() =>
      calculateRealizedPnl({
        entryPrice: bad,
        closePrice: '1',
        closeSize: '1',
        isLong: true,
      })
    ).toThrow(validationError)
    expect(() =>
      wouldImmediatelyLiquidate({
        liquidationPrice: bad,
        currentPrice: '1',
        isLong: true,
      })
    ).toThrow(validationError)
  })
})

describe('safe position formulas', () => {
  it('give the result of the throwing form for a valid input', () => {
    expect(safeCalculateNotionalValue('0.5', '60000')).toBe('30000')
    expect(safeCalculateUnrealizedPnl('50000', '55000', '1')).toBe('5000')
    expect(safeCalculateRoe('500', '1000')).toBe('50')
    expect(safeCalculateRequiredMargin('10000', '10')).toBe('1000')
    expect(
      safeCalculateLiquidationDistance({
        liquidationPrice: '45000',
        currentPrice: '50000',
      })
    ).toBe('10')
    expect(
      safeCalculateEffectiveLeverage({
        positionValueUsd: '10000',
        marginUsd: '1000',
      })
    ).toBe('10')
    expect(
      safeEstimateAverageEntryPrice({
        currentSize: '1',
        currentEntry: '100',
        addSize: '1',
        fillPrice: '200',
      })
    ).toBe('150')
    expect(
      safeEstimateNewLeverage({
        currentNotional: '500',
        currentMargin: '100',
        addNotional: '400',
        addMargin: '20',
      })
    ).toBe('7.5')
    expect(
      safeCalculateRealizedPnl({
        entryPrice: '100',
        closePrice: '150',
        closeSize: '1',
        isLong: true,
      })
    ).toBe('50')
  })

  it('give undefined and log a warning in place of a throw', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      expect(safeCalculateRequiredMargin('10000', '0')).toBeUndefined()
      expect(safeCalculateNotionalValue('abc', '1')).toBeUndefined()
      expect(
        safeEstimateLiquidationPrice({
          entryPrice: 'abc',
          leverage: '10',
          isLong: true,
          maintenanceMarginRate: '0.01',
        })
      ).toBeUndefined()
      expect(
        safeEstimateUnrealizedPnl({
          entryPrice: 'abc',
          markPrice: '1',
          size: '1',
          isLong: true,
        })
      ).toBeUndefined()
      expect(
        safeWouldImmediatelyLiquidate({
          liquidationPrice: 'abc',
          currentPrice: '1',
          isLong: true,
        })
      ).toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(5)
    } finally {
      warn.mockRestore()
    }
  })
})

describe('wouldImmediatelyLiquidate', () => {
  it.each([
    {
      liquidationPrice: '100',
      currentPrice: '100',
      isLong: true,
      expected: true,
    },
    {
      liquidationPrice: '101',
      currentPrice: '100',
      isLong: true,
      expected: true,
    },
    {
      liquidationPrice: '99',
      currentPrice: '100',
      isLong: true,
      expected: false,
    },
    {
      liquidationPrice: '100',
      currentPrice: '100',
      isLong: false,
      expected: true,
    },
    {
      liquidationPrice: '99',
      currentPrice: '100',
      isLong: false,
      expected: true,
    },
    {
      liquidationPrice: '101',
      currentPrice: '100',
      isLong: false,
      expected: false,
    },
    {
      liquidationPrice: '100',
      currentPrice: '0',
      isLong: true,
      expected: false,
    },
    {
      liquidationPrice: '100',
      currentPrice: '0',
      isLong: false,
      expected: false,
    },
    {
      liquidationPrice: '0',
      currentPrice: '100',
      isLong: true,
      expected: false,
    },
    {
      liquidationPrice: '0',
      currentPrice: '100',
      isLong: false,
      expected: false,
    },
  ])('liq $liquidationPrice at $currentPrice (long: $isLong) is $expected', ({
    expected,
    ...params
  }) => {
    expect(wouldImmediatelyLiquidate(params)).toBe(expected)
  })

  it('composes with estimateLiquidationPrice', () => {
    const liquidates = (leverage: string) => {
      const liquidationPrice = estimateLiquidationPrice({
        entryPrice: '100',
        leverage,
        isLong: true,
        maintenanceMarginRate: '0.03',
      })
      if (liquidationPrice === undefined) {
        throw new Error('expected a liquidation price')
      }
      return wouldImmediatelyLiquidate({
        liquidationPrice,
        currentPrice: '100',
        isLong: true,
      })
    }
    expect(liquidates('50')).toBe(true)
    expect(liquidates('10')).toBe(false)
  })
})

const position = (
  marginMode: MarginMode,
  positionMarginAdjustment: PositionMarginAdjustment
): Position => ({
  market: {
    providerId: 'hyperliquid',
    id: 'BTC',
    categoryId: 'perps',
    baseAsset: {
      providerId: 'hyperliquid',
      id: 'BTC',
      displaySymbol: 'BTC',
      logoURI: '',
    },
    quoteAsset: {
      providerId: 'hyperliquid',
      id: 'USDC',
      displaySymbol: 'USDC',
      logoURI: '',
    },
    positionMarginAdjustment,
  },
  side: PositionSide.LONG,
  size: '1',
  entryPrice: '100000',
  markPrice: '100000',
  liquidationPrice: '90000',
  unrealizedPnl: '0',
  accruedFunding: '0',
  leverage: '10',
  marginUsed: '10000',
  initialMarginRequirement: '10000',
  marginMode,
})

describe('positionSupportsMarginAdjustment', () => {
  it.each([
    PositionMarginAdjustment.ADD_ONLY,
    PositionMarginAdjustment.ADD_AND_REMOVE,
  ])('permits an adjustment on an isolated %s market', (capability) => {
    expect(
      positionSupportsMarginAdjustment(
        position(MarginMode.ISOLATED, capability)
      )
    ).toBe(true)
  })

  it('refuses an adjustment when the market exposes no position margin', () => {
    expect(
      positionSupportsMarginAdjustment(
        position(MarginMode.ISOLATED, PositionMarginAdjustment.NONE)
      )
    ).toBe(false)
  })

  it.each([
    PositionMarginAdjustment.NONE,
    PositionMarginAdjustment.ADD_ONLY,
    PositionMarginAdjustment.ADD_AND_REMOVE,
  ])('refuses an adjustment on a cross position of a %s market', (capability) => {
    expect(
      positionSupportsMarginAdjustment(position(MarginMode.CROSS, capability))
    ).toBe(false)
  })
})

describe('positionSupportsMarginRemoval', () => {
  it('permits a removal on an isolated ADD_AND_REMOVE market', () => {
    expect(
      positionSupportsMarginRemoval(
        position(MarginMode.ISOLATED, PositionMarginAdjustment.ADD_AND_REMOVE)
      )
    ).toBe(true)
  })

  it.each([
    PositionMarginAdjustment.ADD_ONLY,
    PositionMarginAdjustment.NONE,
  ])('refuses a removal on an isolated %s market', (capability) => {
    expect(
      positionSupportsMarginRemoval(position(MarginMode.ISOLATED, capability))
    ).toBe(false)
  })

  it('refuses a removal on a cross position of an ADD_AND_REMOVE market', () => {
    expect(
      positionSupportsMarginRemoval(
        position(MarginMode.CROSS, PositionMarginAdjustment.ADD_AND_REMOVE)
      )
    ).toBe(false)
  })

  it.each([
    [MarginMode.ISOLATED, PositionMarginAdjustment.NONE],
    [MarginMode.ISOLATED, PositionMarginAdjustment.ADD_ONLY],
    [MarginMode.ISOLATED, PositionMarginAdjustment.ADD_AND_REMOVE],
    [MarginMode.CROSS, PositionMarginAdjustment.NONE],
    [MarginMode.CROSS, PositionMarginAdjustment.ADD_ONLY],
    [MarginMode.CROSS, PositionMarginAdjustment.ADD_AND_REMOVE],
  ] as const)('never permits a removal an adjustment forbids (%s, %s)', (marginMode, capability) => {
    const subject = position(marginMode, capability)

    expect(
      positionSupportsMarginRemoval(subject) &&
        !positionSupportsMarginAdjustment(subject)
    ).toBe(false)
  })
})
