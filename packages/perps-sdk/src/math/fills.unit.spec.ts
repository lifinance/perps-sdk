import {
  FillClassification,
  OrderSide,
  PerpsErrorCode,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { classifyFill, classifyFillFromPosition } from './fills.js'

/**
 * Exhaustive coverage of `classifyFillFromPosition` against the
 * (start sign × end sign) transition matrix. The helper is shared between
 * Hyperliquid and Lighter; provider-specific tests live alongside each
 * provider's `mapFill` and only exercise the wiring.
 */
describe('classifyFillFromPosition (shared)', () => {
  describe('starting flat (start === 0)', () => {
    it('classifies a buy as OPENED_LONG', () => {
      expect(classifyFillFromPosition('0', 'B', '1')).toBe(
        FillClassification.OPENED_LONG
      )
    })

    it('classifies a sell as OPENED_SHORT', () => {
      expect(classifyFillFromPosition('0', 'A', '1')).toBe(
        FillClassification.OPENED_SHORT
      )
    })
  })

  describe('starting long (start > 0)', () => {
    it('classifies a sell that fully unwinds as CLOSED_LONG', () => {
      expect(classifyFillFromPosition('1', 'A', '1')).toBe(
        FillClassification.CLOSED_LONG
      )
    })

    it('classifies a sell that flips negative as SWITCHED_SHORT', () => {
      expect(classifyFillFromPosition('1', 'A', '2')).toBe(
        FillClassification.SWITCHED_SHORT
      )
    })

    it('classifies a buy that grows the position as INCREASED_LONG', () => {
      expect(classifyFillFromPosition('1', 'B', '1')).toBe(
        FillClassification.INCREASED_LONG
      )
    })

    it('classifies a partial sell as REDUCED_LONG', () => {
      expect(classifyFillFromPosition('2', 'A', '1')).toBe(
        FillClassification.REDUCED_LONG
      )
    })
  })

  describe('starting short (start < 0)', () => {
    it('classifies a buy that fully unwinds as CLOSED_SHORT', () => {
      expect(classifyFillFromPosition('-1', 'B', '1')).toBe(
        FillClassification.CLOSED_SHORT
      )
    })

    it('classifies a buy that flips positive as SWITCHED_LONG', () => {
      expect(classifyFillFromPosition('-1', 'B', '2')).toBe(
        FillClassification.SWITCHED_LONG
      )
    })

    it('classifies a sell that deepens the short as INCREASED_SHORT', () => {
      expect(classifyFillFromPosition('-1', 'A', '1')).toBe(
        FillClassification.INCREASED_SHORT
      )
    })

    it('classifies a partial buy as REDUCED_SHORT', () => {
      expect(classifyFillFromPosition('-2', 'B', '1')).toBe(
        FillClassification.REDUCED_SHORT
      )
    })
  })
})

describe('classifyFill (deprecated — PnL heuristic)', () => {
  it('should classify BUY with no PnL as Opened Long', () => {
    expect(classifyFill(OrderSide.BUY, null)).toBe(
      FillClassification.OPENED_LONG
    )
    expect(classifyFill(OrderSide.BUY, undefined)).toBe(
      FillClassification.OPENED_LONG
    )
  })

  it('should classify BUY with zero PnL as Opened Long', () => {
    expect(classifyFill(OrderSide.BUY, '0')).toBe(
      FillClassification.OPENED_LONG
    )
  })

  it('should classify BUY with non-zero PnL as Closed Short', () => {
    expect(classifyFill(OrderSide.BUY, '150.50')).toBe(
      FillClassification.CLOSED_SHORT
    )
    expect(classifyFill(OrderSide.BUY, '-50.25')).toBe(
      FillClassification.CLOSED_SHORT
    )
  })

  it('should classify SELL with no PnL as Opened Short', () => {
    expect(classifyFill(OrderSide.SELL, null)).toBe(
      FillClassification.OPENED_SHORT
    )
    expect(classifyFill(OrderSide.SELL, undefined)).toBe(
      FillClassification.OPENED_SHORT
    )
  })

  it('should classify SELL with zero PnL as Opened Short', () => {
    expect(classifyFill(OrderSide.SELL, '0')).toBe(
      FillClassification.OPENED_SHORT
    )
  })

  it('should classify SELL with non-zero PnL as Closed Long', () => {
    expect(classifyFill(OrderSide.SELL, '200.00')).toBe(
      FillClassification.CLOSED_LONG
    )
    expect(classifyFill(OrderSide.SELL, '-100.00')).toBe(
      FillClassification.CLOSED_LONG
    )
  })

  it('should treat very small non-zero PnL as a close', () => {
    expect(classifyFill(OrderSide.BUY, '0.01')).toBe(
      FillClassification.CLOSED_SHORT
    )
    expect(classifyFill(OrderSide.SELL, '-0.001')).toBe(
      FillClassification.CLOSED_LONG
    )
  })

  it('should treat "0.0" as zero (not a close)', () => {
    expect(classifyFill(OrderSide.BUY, '0.0')).toBe(
      FillClassification.OPENED_LONG
    )
    expect(classifyFill(OrderSide.SELL, '0.00')).toBe(
      FillClassification.OPENED_SHORT
    )
  })

  it.each([
    'abc',
    '10oops',
    '1e-8',
    '',
    'n/a',
  ])('throws ValidationError naming realizedPnl for %j', (realizedPnl) => {
    expect(() => classifyFill(OrderSide.BUY, realizedPnl)).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining('classifyFill(realizedPnl)'),
      })
    )
  })
})

describe('classifyFillFromPosition validation', () => {
  const malformed = ['abc', '10oops', '1e-8', '']

  it.each(
    malformed
  )('throws ValidationError naming startPosition for %j', (startPosition) => {
    expect(() => classifyFillFromPosition(startPosition, 'B', '1')).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining(
          'classifyFillFromPosition(startPosition)'
        ),
      })
    )
  })

  it.each(malformed)('throws ValidationError naming sz for %j', (sz) => {
    expect(() => classifyFillFromPosition('1', 'A', sz)).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining('classifyFillFromPosition(sz)'),
      })
    )
  })

  it('compares exactly where float addition rounds', () => {
    expect(classifyFillFromPosition('0.3', 'A', '0.1')).toBe(
      FillClassification.REDUCED_LONG
    )
    expect(classifyFillFromPosition('0.3', 'A', '0.3')).toBe(
      FillClassification.CLOSED_LONG
    )
    expect(classifyFillFromPosition('1.0000000000000001', 'A', '1')).toBe(
      FillClassification.REDUCED_LONG
    )
  })
})
