import {
  calculateOrderAmounts,
  createPerpsClient,
  isDecimalString,
} from '@lifi/perps-sdk'
import { type PerpsMarket, PositionMarginAdjustment } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { hyperliquidProvider } from '../HyperliquidProvider.js'
import {
  getMaxPriceDecimals,
  snapOrderPrice,
  snapOrderSize,
} from './orderFormatting.js'

describe('getMaxPriceDecimals', () => {
  it('should return 6 - szDecimals for normal assets', () => {
    expect(getMaxPriceDecimals(0)).toBe(6)
    expect(getMaxPriceDecimals(2)).toBe(4)
    expect(getMaxPriceDecimals(5)).toBe(1)
    expect(getMaxPriceDecimals(6)).toBe(0)
  })

  it('should grant spot markets the wider 8-decimal budget', () => {
    expect(getMaxPriceDecimals(2, 'spot')).toBe(6)
  })

  it('should clamp to zero for szDecimals exceeding max', () => {
    expect(getMaxPriceDecimals(8)).toBe(0)
  })
})

describe('snapOrderSize', () => {
  it('should truncate to szDecimals (not round up)', () => {
    expect(snapOrderSize('1.999', 2)).toBe('1.99')
  })

  it('should remove trailing zeros', () => {
    expect(snapOrderSize('1.5', 4)).toBe('1.5')
    expect(snapOrderSize('1.0', 2)).toBe('1')
    expect(snapOrderSize('2.1', 3)).toBe('2.1')
  })

  it('should handle zero szDecimals (whole number assets)', () => {
    expect(snapOrderSize('3.7', 0)).toBe('3')
    expect(snapOrderSize('10.99', 0)).toBe('10')
  })

  it('should handle exact values', () => {
    expect(snapOrderSize('0.5', 1)).toBe('0.5')
    expect(snapOrderSize('1', 2)).toBe('1')
  })

  it('should handle very small sizes', () => {
    expect(snapOrderSize('0.00123456', 4)).toBe('0.0012')
  })

  it('should handle BTC-like szDecimals (5)', () => {
    expect(snapOrderSize('0.123456789', 5)).toBe('0.12345')
  })

  it('should handle ETH-like szDecimals (4)', () => {
    expect(snapOrderSize('1.23456', 4)).toBe('1.2345')
  })

  it.each(['0', '-0', '0.0'])('should give 0 for the size %j', (size) => {
    expect(snapOrderSize(size, 4)).toBe('0')
  })

  it('should truncate rather than round for boundary values', () => {
    expect(snapOrderSize('0.99999', 3)).toBe('0.999')
  })

  it('should handle large sizes', () => {
    expect(snapOrderSize('100000.12345', 2)).toBe('100000.12')
  })

  it('should keep a size exactly representable at szDecimals', () => {
    expect(snapOrderSize('0.29', 2)).toBe('0.29')
    expect(snapOrderSize('0.57', 2)).toBe('0.57')
    expect(snapOrderSize('1.005', 3)).toBe('1.005')
  })

  it('should keep the last lot step and separate it from the next one', () => {
    expect(snapOrderSize('0.000599', 6)).toBe('0.000599')
    expect(snapOrderSize('0.0006', 6)).toBe('0.0006')
    expect(snapOrderSize('0.0005999', 6)).toBe('0.000599')
  })

  it('should keep all 17 significant digits a number would drop', () => {
    expect(Number('1234567.0000000001')).toBe(1234567)
    expect(snapOrderSize('1234567.0000000001', 10)).toBe('1234567.0000000001')
  })

  it('should still truncate genuinely over-precise sizes toward zero', () => {
    expect(snapOrderSize('0.2949', 2)).toBe('0.29')
    expect(snapOrderSize('0.291', 2)).toBe('0.29')
  })

  it('should truncate sub-lot dust to zero', () => {
    expect(snapOrderSize('0.0000001', 2)).toBe('0')
    expect(snapOrderSize('0.0000001', 4)).toBe('0')
    expect(snapOrderSize('-0.0000001', 2)).toBe('0')
  })

  it('should emit plain notation for sizes at or above 1e21', () => {
    expect(snapOrderSize('1500000000000000000000', 2)).toBe(
      '1500000000000000000000'
    )
  })

  it.each([
    ['1.999', 2],
    ['0.0005999', 6],
    ['1234567.0000000001', 10],
    ['-0.0000001', 2],
    ['1500000000000000000000', 2],
  ] as const)('spells %s at %i szDecimals as a DecimalString', (size, dp) => {
    expect(isDecimalString(snapOrderSize(size, dp))).toBe(true)
  })
})

describe('snapOrderPrice', () => {
  it('should respect max price decimals based on szDecimals', () => {
    expect(snapOrderPrice('1.123456', 2)).toBe('1.1235')
  })

  it('should remove trailing zeros', () => {
    expect(snapOrderPrice('100.1', 2)).toBe('100.1')
    expect(snapOrderPrice('100.0', 2)).toBe('100')
  })

  it('should allow integer prices regardless of significant figures', () => {
    expect(snapOrderPrice('123456', 0)).toBe('123456')
    expect(snapOrderPrice('1000000', 2)).toBe('1000000')
  })

  it('should enforce 5 significant figures for non-integer prices', () => {
    expect(snapOrderPrice('12345.6', 0)).toBe('12346')
  })

  it('should leave a price already inside the 5 significant figures alone', () => {
    expect(snapOrderPrice('0.077', 2)).toBe('0.077')
  })

  it('should handle BTC-like prices (high value, szDecimals=5)', () => {
    expect(snapOrderPrice('95000.5', 5)).toBe('95001')
    expect(snapOrderPrice('95000.55', 5)).toBe('95001')
    expect(snapOrderPrice('95000', 5)).toBe('95000')
    expect(snapOrderPrice('12345.6', 5)).toBe('12346')
    expect(snapOrderPrice('1234.5', 5)).toBe('1234.5')
  })

  it('should handle low-value asset prices', () => {
    expect(snapOrderPrice('0.001234', 0)).toBe('0.001234')
  })

  it('should handle szDecimals=0 (many price decimals allowed)', () => {
    expect(snapOrderPrice('1.123456', 0)).toBe('1.1235')
  })

  it('should handle szDecimals=6 (no price decimals)', () => {
    expect(snapOrderPrice('95.7', 6)).toBe('96')
  })

  it('should handle prices that round to integers', () => {
    expect(snapOrderPrice('99.9999', 4)).toBe('100')
  })

  it('should handle very small prices with many decimals', () => {
    expect(snapOrderPrice('0.000012', 0)).toBe('0.000012')
  })

  it.each(['0', '-0'])('should give 0 for the price %j', (price) => {
    expect(snapOrderPrice(price, 2)).toBe('0')
  })

  it('should round exact-halfway decimals half-up on the true decimal value', () => {
    expect(snapOrderPrice('1.005', 4)).toBe('1.01')
    expect(snapOrderPrice('-1.005', 4)).toBe('-1.01')
  })

  it('should round exact-halfway values half-up at the 5th significant figure', () => {
    expect(snapOrderPrice('0.123455', 0)).toBe('0.12346')
  })

  it('should emit plain notation for prices at or above 1e21', () => {
    expect(snapOrderPrice('1500000000000000000000', 0)).toBe(
      '1500000000000000000000'
    )
  })

  it('should never emit -0', () => {
    expect(snapOrderPrice('-0.00001', 4)).toBe('0')
  })

  it('should widen the decimal budget on spot markets', () => {
    expect(snapOrderPrice('0.00012345', 2)).toBe('0.0001')
    expect(snapOrderPrice('0.00012345', 2, 'spot')).toBe('0.000123')
  })

  it.each([
    ['1.123456', 2],
    ['0.077', 2],
    ['-1.005', 4],
    ['-0.00001', 4],
    ['1500000000000000000000', 0],
  ] as const)('spells %s at %i szDecimals as a DecimalString', (price, dp) => {
    expect(isDecimalString(snapOrderPrice(price, dp))).toBe(true)
  })
})

describe('calculateOrderAmounts over the Hyperliquid plugin', () => {
  const sdk = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    providers: [hyperliquidProvider()],
  })

  const market = (szDecimals: number): PerpsMarket => ({
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
    szDecimals,
    maxLeverage: 40,
    onlyIsolated: false,
    positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
  })

  it('returns a held margin byte-identical and truncates the size onto szDecimals', () => {
    expect(
      calculateOrderAmounts({
        sdk,
        market: market(5),
        held: 'margin',
        amount: '123.456789',
        leverage: 3,
        price: '61729.6',
      })
    ).toEqual({
      margin: '123.456789',
      size: '0.00599',
      notional: '369.760304',
    })
  })

  it('gives a held size in the Hyperliquid spelling, with no trailing zeros', () => {
    expect(
      calculateOrderAmounts({
        sdk,
        market: market(5),
        held: 'size',
        amount: '0.00100',
        leverage: 3,
        price: '61729.6',
      })
    ).toEqual({
      margin: `20.5765${'3'.repeat(36)}`,
      size: '0.001',
      notional: '61.7296',
    })
  })

  it('keeps a sub-cent held notional when the lot grid accepts the size', () => {
    expect(
      calculateOrderAmounts({
        sdk,
        market: market(0),
        held: 'notional',
        amount: '0.009',
        leverage: 2,
        price: '0.0001',
      })
    ).toEqual({ margin: '0.0045', size: '90', notional: '0.009' })
  })
})
