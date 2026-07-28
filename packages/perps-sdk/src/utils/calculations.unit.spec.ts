import {
  type MarketContext,
  type OrderbookLevel,
  PerpsErrorCode,
  type PerpsMarket,
  type SpotMarket,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { PerpsError } from '../errors/PerpsError.js'
import {
  applySlippage,
  buildQuote,
  calculateNotionalValue,
  calculatePositionSize,
  calculateRealizedPnlPercent,
  calculateRequiredMargin,
  calculateRoe,
  calculateUnrealizedPnl,
  effectiveLeverage,
  estimateFees,
  liquidationDistancePercent,
  walkOrderbook,
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

describe('liquidationDistancePercent', () => {
  it('should calculate distance for a long below current price', () => {
    // liq $45k, current $50k = 10% away
    expect(
      liquidationDistancePercent({
        liquidationPrice: 45000,
        currentPrice: 50000,
      })
    ).toBeCloseTo(10)
  })

  it('should calculate distance for a short above current price', () => {
    // liq $55k, current $50k = 10% away
    expect(
      liquidationDistancePercent({
        liquidationPrice: 55000,
        currentPrice: 50000,
      })
    ).toBeCloseTo(10)
  })

  it('should return zero when prices are equal', () => {
    expect(
      liquidationDistancePercent({
        liquidationPrice: 50000,
        currentPrice: 50000,
      })
    ).toBe(0)
  })

  it('should return zero when current price is zero', () => {
    expect(
      liquidationDistancePercent({ liquidationPrice: 45000, currentPrice: 0 })
    ).toBe(0)
  })

  it('should return zero when liquidation price is zero', () => {
    // No liquidation price yet (e.g. unset) reads as 100% away, not a guard case
    expect(
      liquidationDistancePercent({ liquidationPrice: 0, currentPrice: 50000 })
    ).toBe(100)
  })
})

describe('effectiveLeverage', () => {
  it('should calculate leverage from notional and margin', () => {
    // $10,000 notional on $1,000 margin = 10x
    expect(
      effectiveLeverage({ positionValueUsd: 10000, marginUsd: 1000 })
    ).toBe(10)
  })

  it('should return 1x when notional equals margin', () => {
    expect(effectiveLeverage({ positionValueUsd: 5000, marginUsd: 5000 })).toBe(
      1
    )
  })

  it('should return zero when margin is zero', () => {
    expect(effectiveLeverage({ positionValueUsd: 10000, marginUsd: 0 })).toBe(0)
  })

  it('should return zero for zero notional', () => {
    expect(effectiveLeverage({ positionValueUsd: 0, marginUsd: 1000 })).toBe(0)
  })

  it('should handle negative margin', () => {
    // A liquidated/underwater position can report negative margin; the sign
    // carries through rather than being guarded.
    expect(
      effectiveLeverage({ positionValueUsd: 10000, marginUsd: -1000 })
    ).toBe(-10)
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

const asks: OrderbookLevel[] = [
  { price: '100', size: '1' }, // 100 USD notional
  { price: '101', size: '2' }, // 202 USD notional
  { price: '102', size: '5' }, // 510 USD notional
]

const bids: OrderbookLevel[] = [
  { price: '99', size: '1' },
  { price: '98', size: '2' },
]

describe('walkOrderbook', () => {
  it('fills entirely within the best level', () => {
    const walk = walkOrderbook(asks, 50)
    expect(walk.filledNotional).toBe(50)
    expect(walk.baseSize).toBeCloseTo(0.5)
    expect(walk.vwap).toBeCloseTo(100)
    expect(walk.insufficientLiquidity).toBe(false)
  })

  it('walks across levels and computes the VWAP', () => {
    // 100 USD @100 (1 base) + 101 USD @101 (1 base) = 201 USD, 2 base.
    const walk = walkOrderbook(asks, 201)
    expect(walk.filledNotional).toBe(201)
    expect(walk.baseSize).toBeCloseTo(2)
    expect(walk.vwap).toBeCloseTo(100.5)
    expect(walk.insufficientLiquidity).toBe(false)
  })

  it('flags insufficient liquidity and returns the best obtainable fill', () => {
    // Total book notional = 100 + 202 + 510 = 812; request 1000.
    const walk = walkOrderbook(asks, 1000)
    expect(walk.filledNotional).toBe(812)
    expect(walk.baseSize).toBeCloseTo(8)
    expect(walk.insufficientLiquidity).toBe(true)
  })

  it('returns a zero fill for an empty book', () => {
    const walk = walkOrderbook([], 100)
    expect(walk.baseSize).toBe(0)
    expect(walk.filledNotional).toBe(0)
    expect(walk.vwap).toBe(0)
    expect(walk.insufficientLiquidity).toBe(true)
  })

  it('rejects a level with a non-numeric price instead of returning a NaN fill', () => {
    const malformed: OrderbookLevel[] = [{ price: '', size: '1' }]
    expect(() => walkOrderbook(malformed, 50)).toThrow(PerpsError)
    try {
      walkOrderbook(malformed, 50)
      throw new Error('expected walkOrderbook to throw')
    } catch (error) {
      expect((error as PerpsError).code).toBe(PerpsErrorCode.ValidationError)
    }
  })

  it('rejects a level with a non-numeric size', () => {
    const malformed: OrderbookLevel[] = [{ price: '100', size: 'not-a-number' }]
    expect(() => walkOrderbook(malformed, 50)).toThrow(PerpsError)
  })

  it('does not evaluate a malformed level once remaining notional is filled', () => {
    const partiallyMalformed: OrderbookLevel[] = [
      { price: '100', size: '1' },
      { price: '', size: '1' },
    ]
    const walk = walkOrderbook(partiallyMalformed, 50)
    expect(walk.filledNotional).toBe(50)
    expect(walk.insufficientLiquidity).toBe(false)
  })
})

const perpsMarket: PerpsMarket = {
  providerId: 'hyperliquid',
  id: 'BTC',
  categoryId: 'hyperliquid',
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
  szDecimals: 5,
  maxLeverage: 50,
  onlyIsolated: false,
}

const perpsPrice: MarketContext = {
  marketId: 'BTC',
  midPrice: '100',
  markPrice: '100',
  funding: { rate: '0.0001', nextFundingTime: 1704067200000 },
}

const spotMarket: SpotMarket = {
  providerId: 'hyperliquid',
  id: '@1',
  categoryId: 'spot',
  baseAsset: {
    providerId: 'hyperliquid',
    id: '1',
    displaySymbol: 'PURR',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: '0',
    displaySymbol: 'USDC',
    logoURI: '',
  },
  szDecimals: 2,
}

const spotPrice: MarketContext = {
  marketId: '@1',
  midPrice: '100',
  markPrice: '100',
}

describe('buildQuote', () => {
  it('quotes a buy off the asks with taker fee and positive price impact', () => {
    const quote = buildQuote({
      provider: 'hyperliquid',
      symbol: 'BTC',
      type: 'perps',
      side: 'buy',
      sizeUsd: 201,
      market: perpsMarket,
      price: perpsPrice,
      bids,
      asks,
      feeTier: { maker: '0.00015', taker: '0.00045' },
      timestamp: 1700000000000,
    })
    expect(quote.expectedFillPrice).toBe('100.5')
    expect(Number(quote.baseSize)).toBeCloseTo(2)
    // (100.5 - 100) / 100 * 10000 = 50 bps.
    expect(Number(quote.priceImpactBps)).toBeCloseTo(50)
    // 201 * 0.00045 = 0.09045.
    expect(Number(quote.feeUsd)).toBeCloseTo(0.09045)
    expect(quote.isDefaultFeeTier).toBe(true)
    expect(quote.funding).toEqual(perpsPrice.funding)
    expect(quote.insufficientLiquidity).toBe(false)
  })

  it('quotes a sell off the bids', () => {
    const quote = buildQuote({
      provider: 'hyperliquid',
      symbol: 'BTC',
      type: 'perps',
      side: 'sell',
      sizeUsd: 99,
      market: perpsMarket,
      price: perpsPrice,
      bids,
      asks,
      feeTier: { maker: '0', taker: '0' },
      timestamp: 1700000000000,
    })
    expect(quote.expectedFillPrice).toBe('99')
    expect(Number(quote.priceImpactBps)).toBeCloseTo(100)
    expect(quote.feeUsd).toBe('0')
  })

  it('returns null funding for spot markets', () => {
    const quote = buildQuote({
      provider: 'hyperliquid',
      symbol: 'PURR',
      type: 'spot',
      side: 'buy',
      sizeUsd: 50,
      market: spotMarket,
      price: spotPrice,
      bids,
      asks,
      feeTier: { maker: '0', taker: '0' },
      timestamp: 1700000000000,
    })
    expect(quote.funding).toBeNull()
    expect(quote.type).toBe('spot')
  })

  it('flags insufficient liquidity from the walk', () => {
    const quote = buildQuote({
      provider: 'hyperliquid',
      symbol: 'BTC',
      type: 'perps',
      side: 'buy',
      sizeUsd: 1000,
      market: perpsMarket,
      price: perpsPrice,
      bids,
      asks,
      feeTier: { maker: '0', taker: '0' },
      timestamp: 1700000000000,
    })
    expect(quote.insufficientLiquidity).toBe(true)
  })

  it('rejects a malformed book instead of returning a NaN quote', () => {
    const malformedAsks: OrderbookLevel[] = [{ price: '', size: '1' }]
    expect(() =>
      buildQuote({
        provider: 'hyperliquid',
        symbol: 'BTC',
        type: 'perps',
        side: 'buy',
        sizeUsd: 50,
        market: perpsMarket,
        price: perpsPrice,
        bids,
        asks: malformedAsks,
        feeTier: { maker: '0', taker: '0' },
        timestamp: 1700000000000,
      })
    ).toThrow(PerpsError)
  })
})
