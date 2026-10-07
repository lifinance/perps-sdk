import {
  type FeeTier,
  MarginMode,
  type MarketContext,
  type OrderbookLevel,
  OrderSide,
  OrderStatus,
  OrderType,
  PerpsErrorCode,
  type PerpsMarket,
  type Position,
  PositionMarginAdjustment,
  PositionSide,
  type Quote,
  type RegularOrder,
  type SpotMarket,
  TimeInForce,
  TriggerCondition,
  type TriggerOrder,
  type TwapOrder,
} from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { isDecimalString } from '../decimal/parse.js'
import { PerpsError } from '../errors/PerpsError.js'
import {
  applySlippageToPrice,
  buildQuote,
  calculateExpectedPnl,
  calculateRealizedPnlPercent,
  calculateSize,
  calculateTriggerPercent,
  calculateTriggerPrice,
  estimateFees,
  estimateRealizedPnl,
  findMatchingPosition,
  resolveCloseSize,
  safeApplySlippageToPrice,
  safeBuildQuote,
  safeCalculateExpectedPnl,
  safeCalculateRealizedPnlPercent,
  safeCalculateSize,
  safeCalculateTriggerPercent,
  safeCalculateTriggerPrice,
  safeEstimateFees,
  safeEstimateRealizedPnl,
  safeResolveCloseSize,
  safeWalkOrderbook,
  walkOrderbook,
} from './order.js'

describe('calculateSize', () => {
  it('should calculate size from margin, leverage, and price', () => {
    // $1000 margin, 10x leverage, BTC at $50,000 = 0.2 BTC
    expect(calculateSize('1000', '10', '50000')).toBe('0.2')
  })

  it('should scale linearly with leverage', () => {
    expect(calculateSize('1000', '1', '50000')).toBe('0.02')
    expect(calculateSize('1000', '10', '50000')).toBe('0.2')
  })

  it('should handle small margin amounts', () => {
    expect(calculateSize('10', '5', '100000')).toBe('0.0005')
  })

  it('should handle very high prices', () => {
    expect(calculateSize('1000', '1', '1000000')).toBe('0.001')
  })

  it('should handle very low prices', () => {
    // $100 margin, 2x, price $0.001 = 200,000 units
    expect(calculateSize('100', '2', '0.001')).toBe('200000')
  })

  it('throws a ValidationError when price is zero', () => {
    expect(() => calculateSize('1000', '10', '0')).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })

  it('should return zero when margin is zero', () => {
    expect(calculateSize('0', '10', '50000')).toBe('0')
  })
})

describe('estimateFees', () => {
  it('should calculate fee from size and rate', () => {
    // $10,000 size at 0.035% (taker) = $3.50
    expect(estimateFees('10000', '0.00035')).toBe('3.5')
  })

  it('should return zero for zero size', () => {
    expect(estimateFees('0', '0.00035')).toBe('0')
  })

  it('should return zero for zero fee rate', () => {
    expect(estimateFees('10000', '0')).toBe('0')
  })

  it('should handle maker fee rate', () => {
    // $10,000 size at 0.01% (maker) = $1.00
    expect(estimateFees('10000', '0.0001')).toBe('1')
  })

  it('should scale linearly with size', () => {
    expect(estimateFees('10000', '0.00035')).toBe('3.5')
    expect(estimateFees('20000', '0.00035')).toBe('7')
  })
})

describe('applySlippageToPrice', () => {
  it('raises a buy price by the exact percentage', () => {
    expect(applySlippageToPrice('100', '0.5', true)).toBe('100.5')
    expect(applySlippageToPrice('100', '5', true)).toBe('105')
    expect(applySlippageToPrice('0.07', '10', true)).toBe('0.077')
  })

  it('divides a sell price without rounding', () => {
    expect(applySlippageToPrice('110', '10', false)).toBe('100')
    expect(applySlippageToPrice('100', '0.5', false)).toBe(
      '99.5024875621890547263681592039800995024876'
    )
  })

  it('keeps more digits than a float can hold', () => {
    expect(applySlippageToPrice('12345678901234567.89', '1', true)).toBe(
      '12469135690246913.5689'
    )
  })

  it('returns the price unchanged for zero slippage', () => {
    expect(applySlippageToPrice('50000', '0', true)).toBe('50000')
    expect(applySlippageToPrice('50000', '0', false)).toBe('50000')
  })

  it('moves a buy further from the price than a sell', () => {
    // Buy: 100 × 1.01 = 101. Sell: 100 ÷ 1.01 ≈ 99.0099.
    expect(applySlippageToPrice('100', '1', true)).toBe('101')
    expect(applySlippageToPrice('100', '1', false)).toBe(
      '99.0099009900990099009900990099009900990099'
    )
  })

  it('raises a very small buy price', () => {
    expect(applySlippageToPrice('0.00001', '0.5', true)).toBe('0.00001005')
  })

  it.each([
    'abc',
    '1e-7',
    '',
  ])('throws a ValidationError for the price %j', (price) => {
    expect(() => applySlippageToPrice(price, '1', true)).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })

  it.each([
    'NaN',
    'Infinity',
    'abc',
    '-100',
    '-150',
  ])('throws a ValidationError for the slippage %s', (slippage) => {
    expect(() => applySlippageToPrice('100', slippage, false)).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})

describe('calculateRealizedPnlPercent', () => {
  it('should calculate positive PnL percentage', () => {
    // $50 profit on 1 unit at $500 = 10%
    expect(calculateRealizedPnlPercent('50', '1', '500')).toBe('10')
  })

  it('should calculate negative PnL percentage', () => {
    expect(calculateRealizedPnlPercent('-25', '0.5', '1000')).toBe('-5')
  })

  it('throws a ValidationError for a zero position value', () => {
    expect(() => calculateRealizedPnlPercent('100', '0', '1000')).toThrow(
      '`size × price` must not be zero.'
    )
    expect(() => calculateRealizedPnlPercent('100', '1', '0')).toThrow(
      '`size × price` must not be zero.'
    )
  })

  it('should use absolute size for negative sizes', () => {
    expect(calculateRealizedPnlPercent('50', '-1', '500')).toBe('10')
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
    const walk = walkOrderbook(asks, '50')
    expect(walk.filledNotional).toBe('50')
    expect(walk.baseSize).toBe('0.5')
    expect(walk.vwap).toBe('100')
    expect(walk.insufficientLiquidity).toBe(false)
  })

  it('walks across levels and computes the VWAP', () => {
    // 100 USD @100 (1 base) + 101 USD @101 (1 base) = 201 USD, 2 base.
    const walk = walkOrderbook(asks, '201')
    expect(walk.filledNotional).toBe('201')
    expect(walk.baseSize).toBe('2')
    expect(walk.vwap).toBe('100.5')
    expect(walk.insufficientLiquidity).toBe(false)
  })

  it('flags insufficient liquidity and returns the best obtainable fill', () => {
    // Total book notional = 100 + 202 + 510 = 812; request 1000.
    const walk = walkOrderbook(asks, '1000')
    expect(walk.filledNotional).toBe('812')
    expect(walk.baseSize).toBe('8')
    expect(walk.insufficientLiquidity).toBe(true)
  })

  it('returns a zero fill for an empty book', () => {
    const walk = walkOrderbook([], '100')
    expect(walk.baseSize).toBe('0')
    expect(walk.filledNotional).toBe('0')
    expect(walk.vwap).toBe('0')
    expect(walk.insufficientLiquidity).toBe(true)
  })

  it('rejects a level with a non-numeric price instead of returning a NaN fill', () => {
    const malformed: OrderbookLevel[] = [{ price: '', size: '1' }]
    expect(() => walkOrderbook(malformed, '50')).toThrow(PerpsError)
    try {
      walkOrderbook(malformed, '50')
      throw new Error('expected walkOrderbook to throw')
    } catch (error) {
      expect((error as PerpsError).code).toBe(PerpsErrorCode.ValidationError)
    }
  })

  it('rejects a level with a non-numeric size', () => {
    const malformed: OrderbookLevel[] = [{ price: '100', size: 'not-a-number' }]
    expect(() => walkOrderbook(malformed, '50')).toThrow(PerpsError)
  })

  it('does not evaluate a malformed level once remaining notional is filled', () => {
    const partiallyMalformed: OrderbookLevel[] = [
      { price: '100', size: '1' },
      { price: '', size: '1' },
    ]
    const walk = walkOrderbook(partiallyMalformed, '50')
    expect(walk.filledNotional).toBe('50')
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
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
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
      sizeUsd: '201',
      market: perpsMarket,
      price: perpsPrice,
      bids,
      asks,
      feeTier: { maker: '0.00015', taker: '0.00045' },
      timestamp: 1700000000000,
    })
    expect(quote.expectedFillPrice).toBe('100.5')
    expect(quote.baseSize).toBe('2')
    // (100.5 - 100) / 100 * 10000 = 50 bps.
    expect(quote.priceImpactBps).toBe('50')
    // 201 * 0.00045 = 0.09045.
    expect(quote.feeUsd).toBe('0.09045')
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
      sizeUsd: '99',
      market: perpsMarket,
      price: perpsPrice,
      bids,
      asks,
      feeTier: { maker: '0', taker: '0' },
      timestamp: 1700000000000,
    })
    expect(quote.expectedFillPrice).toBe('99')
    expect(quote.priceImpactBps).toBe('100')
    expect(quote.feeUsd).toBe('0')
  })

  it('returns null funding for spot markets', () => {
    const quote = buildQuote({
      provider: 'hyperliquid',
      symbol: 'PURR',
      type: 'spot',
      side: 'buy',
      sizeUsd: '50',
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
      sizeUsd: '1000',
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
        sizeUsd: '50',
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

describe('buildQuote decimal spelling', () => {
  const DECIMAL_FIELDS = [
    'sizeUsd',
    'baseSize',
    'expectedFillPrice',
    'priceImpactBps',
    'feeUsd',
  ] as const

  const quoteOf = (input: {
    sizeUsd: string
    asks?: OrderbookLevel[]
    price?: MarketContext
    feeTier?: FeeTier
  }): Quote =>
    buildQuote({
      provider: 'hyperliquid',
      symbol: 'BTC',
      type: 'perps',
      side: 'buy',
      market: perpsMarket,
      price: perpsPrice,
      bids,
      asks,
      feeTier: { maker: '0', taker: '0.00035' },
      timestamp: 1700000000000,
      ...input,
    })

  const expectDecimalFields = (quote: Quote) => {
    for (const field of DECIMAL_FIELDS) {
      expect(isDecimalString(quote[field]), `${field} -> ${quote[field]}`).toBe(
        true
      )
    }
  }

  it('spells a sub-micro fee and price impact without an exponent', () => {
    const quote = quoteOf({
      sizeUsd: '0.001',
      asks: [{ price: '100.000000001', size: '1' }],
    })
    expect(quote.feeUsd).toBe('0.00000035')
    expectDecimalFields(quote)
  })

  it('spells figures of at least 1e21 without an exponent', () => {
    const price = '10000000000000000000000'
    const quote = quoteOf({
      sizeUsd: '1000000000000000000000000000000',
      price: { ...perpsPrice, markPrice: price },
      asks: [{ price, size: '10000000000' }],
    })
    expect(quote.sizeUsd).toBe('1000000000000000000000000000000')
    expect(quote.expectedFillPrice).toBe(price)
    expectDecimalFields(quote)
  })

  it.each([
    'NaN',
    'Infinity',
    'abc',
  ])('rejects a non-decimal sizeUsd (%s) instead of spelling it', (sizeUsd) => {
    expect(() => quoteOf({ sizeUsd })).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })

  it('rejects a taker fee that does not match the decimal pattern', () => {
    expect(() =>
      quoteOf({ sizeUsd: '100', feeTier: { maker: '0', taker: 'abc' } })
    ).toThrow(expect.objectContaining({ code: PerpsErrorCode.ValidationError }))
  })

  it('rejects a mark price that does not match the decimal pattern', () => {
    expect(() =>
      quoteOf({ sizeUsd: '100', price: { ...perpsPrice, markPrice: 'abc' } })
    ).toThrow(expect.objectContaining({ code: PerpsErrorCode.ValidationError }))
  })
})

describe('exact decimal results', () => {
  it('calculateSize lands on the lot boundary', () => {
    expect(calculateSize('7', '2', '0.07')).toBe('200')
    expect(calculateSize('7', '3', '0.07')).toBe('300')
    expect(calculateSize('7', '10', '0.07')).toBe('1000')
  })

  it('estimateFees', () => {
    expect(estimateFees('0.7', '0.1')).toBe('0.07')
  })

  it('calculateExpectedPnl', () => {
    expect(calculateExpectedPnl('0.77', '0.7', '3', true, '10')).toEqual({
      amount: '3',
      percent: '30',
    })
    expect(calculateExpectedPnl('0.63', '0.7', '3', false, '10')?.percent).toBe(
      '30'
    )
  })

  it.each([
    ['triggerPrice', '0', '0.7', '10'],
    ['entryPrice', '0.77', '0', '10'],
    ['margin', '0.77', '0.7', '0'],
  ])('calculateExpectedPnl throws a ValidationError that names a zero %s', (name, trigger, entry, margin) => {
    expect(() =>
      calculateExpectedPnl(trigger, entry, '3', true, margin)
    ).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: `\`${name}\` must not be zero.`,
      })
    )
  })

  it.each([
    ['entryPrice', '0', '3'],
    ['leverage', '0.7', '0'],
  ])('calculateTriggerPrice and calculateTriggerPercent throw a ValidationError that names a zero %s', (name, entry, leverage) => {
    const message = `\`${name}\` must not be zero.`
    expect(() => calculateTriggerPrice('30', entry, leverage, true)).toThrow(
      message
    )
    expect(() =>
      calculateTriggerPercent('0.77', entry, leverage, true)
    ).toThrow(message)
  })

  it('calculateTriggerPrice', () => {
    expect(calculateTriggerPrice('30', '0.7', '3', true)).toBe('0.77')
  })

  it('calculateTriggerPercent', () => {
    expect(calculateTriggerPercent('0.77', '0.7', '3', true)).toBe('30')
  })

  it('calculateRealizedPnlPercent', () => {
    expect(calculateRealizedPnlPercent('0.3', '1', '0.1')).toBe('300')
  })

  it('walkOrderbook', () => {
    const walk = walkOrderbook([{ price: '0.1', size: '3' }], '0.3')
    expect(walk.baseSize).toBe('3')
    expect(walk.filledNotional).toBe('0.3')
    expect(walk.vwap).toBe('0.1')
    expect(walk.insufficientLiquidity).toBe(false)
  })

  it('buildQuote', () => {
    const quote = buildQuote({
      provider: 'hyperliquid',
      symbol: 'BTC',
      type: 'perps',
      side: 'buy',
      sizeUsd: '0.3',
      market: perpsMarket,
      price: perpsPrice,
      bids,
      asks: [{ price: '0.1', size: '3' }],
      feeTier: { maker: '0', taker: '0' },
      timestamp: 1700000000000,
    })
    expect(quote.baseSize).toBe('3')
  })

  it('keeps 40 decimal places for a non-terminating quotient', () => {
    expect(calculateTriggerPrice('10', '100', '3', true)).toBe(
      '103.3333333333333333333333333333333333333333'
    )
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
    expect(() => calculateSize(bad, '2', '1')).toThrow(validationError)
    expect(() => estimateFees(bad, '0.1')).toThrow(validationError)
    expect(() => calculateExpectedPnl('1', bad, '2', true, '1')).toThrow(
      validationError
    )
    expect(() => calculateTriggerPrice(bad, '1', '2', true)).toThrow(
      validationError
    )
    expect(() => calculateTriggerPercent(bad, '1', '2', true)).toThrow(
      validationError
    )
    expect(() => calculateRealizedPnlPercent(bad, '1', '1')).toThrow(
      validationError
    )
    expect(() => walkOrderbook([{ price: '1', size: '1' }], bad)).toThrow(
      validationError
    )
    expect(() => resolveCloseSize(bad, '1')).toThrow(validationError)
  })
})

describe('safe order formulas', () => {
  it('give the result of the throwing form for a valid input', () => {
    expect(safeCalculateSize('1000', '10', '50000')).toBe('0.2')
    expect(safeEstimateFees('10000', '0.00035')).toBe('3.5')
    expect(safeApplySlippageToPrice('100', '0.5', true)).toBe('100.5')
    expect(safeCalculateExpectedPnl('0.77', '0.7', '3', true, '10')).toEqual({
      amount: '3',
      percent: '30',
    })
    expect(safeCalculateTriggerPrice('30', '0.7', '3', true)).toBe('0.77')
    expect(safeCalculateTriggerPercent('0.77', '0.7', '3', true)).toBe('30')
    expect(safeCalculateRealizedPnlPercent('50', '1', '500')).toBe('10')
    expect(safeWalkOrderbook(asks, '50')?.vwap).toBe('100')
    expect(safeResolveCloseSize('5', '2')).toBe('2')
  })

  it('give undefined and log a warning in place of a throw', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      expect(safeCalculateSize('1000', '10', '0')).toBeUndefined()
      expect(safeEstimateFees('abc', '0.1')).toBeUndefined()
      expect(safeApplySlippageToPrice('100', '-100', true)).toBeUndefined()
      expect(
        safeCalculateExpectedPnl('1', 'abc', '2', true, '1')
      ).toBeUndefined()
      expect(safeCalculateTriggerPrice('abc', '1', '2', true)).toBeUndefined()
      expect(safeCalculateTriggerPercent('abc', '1', '2', true)).toBeUndefined()
      expect(safeCalculateRealizedPnlPercent('abc', '1', '1')).toBeUndefined()
      expect(safeWalkOrderbook(asks, 'abc')).toBeUndefined()
      expect(safeResolveCloseSize('abc', '1')).toBeUndefined()
      expect(
        safeBuildQuote({
          provider: 'hyperliquid',
          symbol: 'BTC',
          type: 'perps',
          side: 'buy',
          sizeUsd: 'abc',
          market: perpsMarket,
          price: perpsPrice,
          bids,
          asks,
          feeTier: { maker: '0', taker: '0' },
          timestamp: 1700000000000,
        })
      ).toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(10)
    } finally {
      warn.mockRestore()
    }
  })
})

describe('walkOrderbook zero-price level', () => {
  it('skips a level that absorbs no notional instead of dividing by zero', () => {
    const walk = walkOrderbook(
      [
        { price: '0', size: '5' },
        { price: '100', size: '1' },
      ],
      '50'
    )
    expect(walk.baseSize).toBe('0.5')
    expect(walk.filledNotional).toBe('50')
    expect(walk.vwap).toBe('100')
  })
})

describe('resolveCloseSize', () => {
  it('reads a zero order size as closing the whole position', () => {
    expect(resolveCloseSize('0', '3')).toBe('3')
  })

  it('caps the close at the position size', () => {
    expect(resolveCloseSize('5', '2')).toBe('2')
    expect(resolveCloseSize('1', '2')).toBe('1')
  })
})

const baseAsset = (symbol: string) => ({
  providerId: 'hyperliquid',
  id: symbol,
  displaySymbol: symbol,
  logoURI: `https://x/${symbol}.png`,
})

const USDC = {
  providerId: 'hyperliquid',
  id: 'USDC',
  displaySymbol: 'USDC',
  logoURI: 'https://x/usdc.png',
}

const MARKET_BTC = {
  providerId: 'hyperliquid',
  id: 'BTC',
  categoryId: 'hyperliquid',
  baseAsset: baseAsset('BTC'),
  quoteAsset: USDC,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
}

const MARKET_ETH = {
  providerId: 'hyperliquid',
  id: 'ETH',
  categoryId: 'hyperliquid',
  baseAsset: baseAsset('ETH'),
  quoteAsset: USDC,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
}

function position(
  overrides: Partial<Position> & Pick<Position, 'side' | 'size' | 'entryPrice'>
): Position {
  return {
    market: MARKET_BTC,
    markPrice: '0',
    liquidationPrice: '0',
    unrealizedPnl: '0',
    accruedFunding: '0',
    leverage: '1',
    marginUsed: '0',
    initialMarginRequirement: '0',
    marginMode: MarginMode.CROSS,
    ...overrides,
  }
}

function openOrder(
  overrides: Partial<RegularOrder> &
    Pick<RegularOrder, 'side' | 'remainingSize' | 'price'>
): RegularOrder {
  return {
    orderId: 'order-1',
    market: MARKET_BTC,
    type: OrderType.LIMIT,
    // Unfilled-order default; pass originalSize explicitly for a partial fill.
    originalSize: overrides.remainingSize,
    filledSize: '0',
    reduceOnly: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    status: OrderStatus.OPEN,
    timeInForce: TimeInForce.GTC,
    ...overrides,
  }
}

function triggerOrder(
  overrides: Partial<TriggerOrder> &
    Pick<TriggerOrder, 'remainingSize' | 'triggerPrice'>
): TriggerOrder {
  return {
    orderId: 'trigger-1',
    market: MARKET_BTC,
    type: OrderType.TAKE_PROFIT_MARKET,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    side: OrderSide.SELL,
    originalSize: overrides.remainingSize,
    filledSize: '0',
    reduceOnly: true,
    status: OrderStatus.OPEN,
    triggerCondition: TriggerCondition.ABOVE,
    ...overrides,
  }
}

function twapOrder(): TwapOrder {
  return {
    orderId: 'twap-1',
    market: MARKET_BTC,
    type: OrderType.TWAP,
    side: OrderSide.SELL,
    originalSize: '1',
    remainingSize: '1',
    filledSize: '0',
    reduceOnly: false,
    status: OrderStatus.OPEN,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    durationSeconds: 600,
    startedAt: '2025-01-01T00:00:00Z',
  }
}

describe('findMatchingPosition', () => {
  it('finds the position whose marketId matches', () => {
    const btc = position({
      side: PositionSide.LONG,
      size: '1',
      entryPrice: '100',
      market: MARKET_BTC,
    })
    const eth = position({
      side: PositionSide.SHORT,
      size: '5',
      entryPrice: '3000',
      market: MARKET_ETH,
    })
    expect(findMatchingPosition('BTC', [btc, eth])).toBe(btc)
    expect(findMatchingPosition('ETH', [btc, eth])).toBe(eth)
  })

  it('returns undefined when no position matches', () => {
    const btc = position({
      side: PositionSide.LONG,
      size: '1',
      entryPrice: '100',
    })
    expect(findMatchingPosition('SOL', [btc])).toBeUndefined()
  })
})

describe('estimateRealizedPnl on a regular order', () => {
  it('computes profit for a SELL order reducing a long', () => {
    // 1 BTC long @ 100, sell limit at 150 => +50
    const r = estimateRealizedPnl(
      openOrder({ side: OrderSide.SELL, remainingSize: '1', price: '150' }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBe('50')
  })

  it('returns undefined when nothing remains to fill', () => {
    const r = estimateRealizedPnl(
      openOrder({
        side: OrderSide.SELL,
        remainingSize: '0',
        originalSize: '1',
        filledSize: '1',
        price: '150',
      }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBeUndefined()
  })

  it('computes loss for a SELL order reducing a long below entry', () => {
    const r = estimateRealizedPnl(
      openOrder({ side: OrderSide.SELL, remainingSize: '2', price: '80' }),
      position({ side: PositionSide.LONG, size: '2', entryPrice: '100' })
    )
    expect(r).toBe('-40')
  })

  it('computes profit for a BUY order reducing a short', () => {
    // 2 BTC short @ 100, buy limit at 80 => +40
    const r = estimateRealizedPnl(
      openOrder({ side: OrderSide.BUY, remainingSize: '2', price: '80' }),
      position({ side: PositionSide.SHORT, size: '2', entryPrice: '100' })
    )
    expect(r).toBe('40')
  })

  it('computes loss for a BUY order reducing a short above entry', () => {
    const r = estimateRealizedPnl(
      openOrder({ side: OrderSide.BUY, remainingSize: '1', price: '120' }),
      position({ side: PositionSide.SHORT, size: '1', entryPrice: '100' })
    )
    expect(r).toBe('-20')
  })

  it('caps order size at the position size', () => {
    // long 1 BTC @ 100, sell 5 BTC @ 150 — only 1 BTC actually closes => +50
    const r = estimateRealizedPnl(
      openOrder({ side: OrderSide.SELL, remainingSize: '5', price: '150' }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBe('50')
  })

  it('projects only the remaining size of a partially filled order', () => {
    // 3 BTC long @ 100; sell limit at 150 submitted for 3 BTC, 2 already
    // filled => only the resting 1 BTC projects => +50, not +150.
    const r = estimateRealizedPnl(
      openOrder({
        side: OrderSide.SELL,
        originalSize: '3',
        remainingSize: '1',
        filledSize: '2',
        price: '150',
      }),
      position({ side: PositionSide.LONG, size: '3', entryPrice: '100' })
    )
    expect(r).toBe('50')
  })

  it('returns undefined when the order matches no position', () => {
    const r = estimateRealizedPnl(
      openOrder({ side: OrderSide.SELL, remainingSize: '1', price: '150' }),
      undefined
    )
    expect(r).toBeUndefined()
  })

  it('returns undefined for a same-side BUY against a long (adds to the position)', () => {
    const r = estimateRealizedPnl(
      openOrder({ side: OrderSide.BUY, remainingSize: '1', price: '90' }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBeUndefined()
  })

  it('returns undefined for a same-side SELL against a short (adds to the short)', () => {
    const r = estimateRealizedPnl(
      openOrder({ side: OrderSide.SELL, remainingSize: '1', price: '110' }),
      position({ side: PositionSide.SHORT, size: '1', entryPrice: '100' })
    )
    expect(r).toBeUndefined()
  })

  it('treats a signed position size correctly via its absolute value', () => {
    // SDK Position.size for a short can serialise as "-1"; the cap should
    // still see 1 BTC of close-able size.
    const r = estimateRealizedPnl(
      openOrder({ side: OrderSide.BUY, remainingSize: '5', price: '80' }),
      position({ side: PositionSide.SHORT, size: '-1', entryPrice: '100' })
    )
    expect(r).toBe('20') // (100 - 80) * 1 = +20
  })
})

describe('estimateRealizedPnl on a trigger order', () => {
  it('computes profit for a TP on a long at trigger > entry', () => {
    const r = estimateRealizedPnl(
      triggerOrder({ remainingSize: '1', triggerPrice: '150' }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBe('50')
  })

  it('computes loss for a SL on a long at trigger < entry', () => {
    const r = estimateRealizedPnl(
      triggerOrder({
        remainingSize: '1',
        triggerPrice: '90',
        type: OrderType.STOP_MARKET,
      }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBe('-10')
  })

  it('computes profit for a TP on a short at trigger < entry', () => {
    const r = estimateRealizedPnl(
      triggerOrder({
        remainingSize: '2',
        triggerPrice: '80',
        side: OrderSide.BUY,
      }),
      position({ side: PositionSide.SHORT, size: '2', entryPrice: '100' })
    )
    expect(r).toBe('40')
  })

  it('uses the full position size when originalSize is zero on a reduce-only trigger', () => {
    const r = estimateRealizedPnl(
      triggerOrder({ remainingSize: '0', triggerPrice: '150' }),
      position({ side: PositionSide.LONG, size: '3', entryPrice: '100' })
    )
    expect(r).toBe('150') // (150 - 100) * 3
  })

  it('caps an oversized trigger size at the position size', () => {
    const r = estimateRealizedPnl(
      triggerOrder({
        remainingSize: '10',
        triggerPrice: '80',
        side: OrderSide.BUY,
      }),
      position({ side: PositionSide.SHORT, size: '2', entryPrice: '100' })
    )
    expect(r).toBe('40') // capped to 2 short
  })

  it('uses triggerPrice, not the optional limitPrice, as the rPnL price', () => {
    // STOP_LIMIT — limitPrice is the post-trigger limit, not the rPnL price
    const r = estimateRealizedPnl(
      triggerOrder({
        remainingSize: '1',
        triggerPrice: '90',
        limitPrice: '85',
        type: OrderType.STOP_LIMIT,
      }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBe('-10') // priced off triggerPrice (90), not limitPrice (85)
  })

  it('projects an accepted trigger order that waits on no parent order', () => {
    const r = estimateRealizedPnl(
      triggerOrder({
        remainingSize: '1',
        triggerPrice: '150',
        status: OrderStatus.ACCEPTED,
      }),
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBe('50')
  })

  it('returns undefined when the trigger order carries no triggerPrice', () => {
    const { triggerPrice: _, ...withoutTrigger } = triggerOrder({
      remainingSize: '1',
      triggerPrice: '150',
    })
    const r = estimateRealizedPnl(
      withoutTrigger,
      position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
    )
    expect(r).toBeUndefined()
  })

  it('throws a ValidationError for a trigger price that does not match the decimal pattern', () => {
    expect(() =>
      estimateRealizedPnl(
        triggerOrder({ remainingSize: '1', triggerPrice: 'abc' }),
        position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
      )
    ).toThrow(expect.objectContaining({ code: PerpsErrorCode.ValidationError }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      expect(
        safeEstimateRealizedPnl(
          triggerOrder({ remainingSize: '1', triggerPrice: 'abc' }),
          position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
        )
      ).toBeUndefined()
    } finally {
      warn.mockRestore()
    }
  })

  it('returns undefined when the trigger has no matching position', () => {
    const r = estimateRealizedPnl(
      triggerOrder({ remainingSize: '1', triggerPrice: '150' }),
      undefined
    )
    expect(r).toBeUndefined()
  })

  it('does not project pending, terminal, same-side, or exhausted trigger orders', () => {
    const long = position({
      side: PositionSide.LONG,
      size: '1',
      entryPrice: '100',
    })
    for (const overrides of [
      { status: OrderStatus.PENDING, parentOrderId: 'parent' },
      { status: OrderStatus.FILLED },
      { side: OrderSide.BUY },
      { originalSize: '1', remainingSize: '0' },
    ]) {
      expect(
        estimateRealizedPnl(
          triggerOrder({
            remainingSize: '1',
            triggerPrice: '120',
            ...overrides,
          }),
          long
        )
      ).toBeUndefined()
    }
  })
})

describe('estimateRealizedPnl dispatch', () => {
  it('projects nothing for a TWAP parent, which carries no execution price', () => {
    expect(
      estimateRealizedPnl(
        twapOrder(),
        position({ side: PositionSide.LONG, size: '1', entryPrice: '100' })
      )
    ).toBeUndefined()
  })

  it('prices a regular order at its limit and a trigger order at its trigger', () => {
    const long = position({
      side: PositionSide.LONG,
      size: '1',
      entryPrice: '100',
    })
    const limit = openOrder({
      side: OrderSide.SELL,
      remainingSize: '1',
      price: '150',
    })
    const trigger = triggerOrder({
      remainingSize: '1',
      triggerPrice: '120',
    })
    expect(estimateRealizedPnl(limit, long)).toBe('50')
    expect(estimateRealizedPnl(trigger, long)).toBe('20')
  })
})
