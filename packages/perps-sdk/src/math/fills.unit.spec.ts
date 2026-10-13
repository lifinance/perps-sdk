import { FillClassification, OrderSide } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { classifyFillFromPosition } from './fills.js'

/**
 * Exhaustive coverage of `classifyFillFromPosition` against the
 * (start sign × end sign) transition matrix. The helper is shared between
 * Hyperliquid and Lighter; provider-specific tests live alongside each
 * provider's `mapFill` and only exercise the wiring.
 */
describe('classifyFillFromPosition (shared)', () => {
  describe('starting flat (start === 0)', () => {
    it('classifies a buy as OPENED_LONG', () => {
      expect(classifyFillFromPosition('0', OrderSide.BUY, '1')).toBe(
        FillClassification.OPENED_LONG
      )
    })

    it('classifies a sell as OPENED_SHORT', () => {
      expect(classifyFillFromPosition('0', OrderSide.SELL, '1')).toBe(
        FillClassification.OPENED_SHORT
      )
    })
  })

  describe('starting long (start > 0)', () => {
    it('classifies a sell that fully unwinds as CLOSED_LONG', () => {
      expect(classifyFillFromPosition('1', OrderSide.SELL, '1')).toBe(
        FillClassification.CLOSED_LONG
      )
    })

    it('classifies a sell that flips negative as SWITCHED_SHORT', () => {
      expect(classifyFillFromPosition('1', OrderSide.SELL, '2')).toBe(
        FillClassification.SWITCHED_SHORT
      )
    })

    it('classifies a buy that grows the position as INCREASED_LONG', () => {
      expect(classifyFillFromPosition('1', OrderSide.BUY, '1')).toBe(
        FillClassification.INCREASED_LONG
      )
    })

    it('classifies a partial sell as REDUCED_LONG', () => {
      expect(classifyFillFromPosition('2', OrderSide.SELL, '1')).toBe(
        FillClassification.REDUCED_LONG
      )
    })
  })

  describe('starting short (start < 0)', () => {
    it('classifies a buy that fully unwinds as CLOSED_SHORT', () => {
      expect(classifyFillFromPosition('-1', OrderSide.BUY, '1')).toBe(
        FillClassification.CLOSED_SHORT
      )
    })

    it('classifies a buy that flips positive as SWITCHED_LONG', () => {
      expect(classifyFillFromPosition('-1', OrderSide.BUY, '2')).toBe(
        FillClassification.SWITCHED_LONG
      )
    })

    it('classifies a sell that deepens the short as INCREASED_SHORT', () => {
      expect(classifyFillFromPosition('-1', OrderSide.SELL, '1')).toBe(
        FillClassification.INCREASED_SHORT
      )
    })

    it('classifies a partial buy as REDUCED_SHORT', () => {
      expect(classifyFillFromPosition('-2', OrderSide.BUY, '1')).toBe(
        FillClassification.REDUCED_SHORT
      )
    })
  })
})

describe('classifyFillFromPosition with a malformed input', () => {
  const malformed = ['abc', '10oops', '1e-8', '', '$10']

  it.each(malformed)('gives the side for startPosition %j', (startPosition) => {
    expect(classifyFillFromPosition(startPosition, OrderSide.BUY, '1')).toBe(
      FillClassification.BUY
    )
    expect(classifyFillFromPosition(startPosition, OrderSide.SELL, '1')).toBe(
      FillClassification.SELL
    )
  })

  it.each(malformed)('gives the side for sz %j', (sz) => {
    expect(classifyFillFromPosition('1', OrderSide.BUY, sz)).toBe(
      FillClassification.BUY
    )
    expect(classifyFillFromPosition('1', OrderSide.SELL, sz)).toBe(
      FillClassification.SELL
    )
  })

  it('compares exactly where float addition rounds', () => {
    expect(classifyFillFromPosition('0.3', OrderSide.SELL, '0.1')).toBe(
      FillClassification.REDUCED_LONG
    )
    expect(classifyFillFromPosition('0.3', OrderSide.SELL, '0.3')).toBe(
      FillClassification.CLOSED_LONG
    )
    expect(
      classifyFillFromPosition('1.0000000000000001', OrderSide.SELL, '1')
    ).toBe(FillClassification.REDUCED_LONG)
  })
})
