import { FillClassification, OrderSide, OrderType } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import {
  classifyFill,
  isStopLossOrder,
  isTakeProfitOrder,
  isTpSlOrder,
} from './orderClassification.js'

describe('isTakeProfitOrder', () => {
  it('should detect TAKE_PROFIT_MARKET', () => {
    expect(isTakeProfitOrder({ type: OrderType.TAKE_PROFIT_MARKET })).toBe(true)
  })

  it('should detect TAKE_PROFIT_LIMIT', () => {
    expect(isTakeProfitOrder({ type: OrderType.TAKE_PROFIT_LIMIT })).toBe(true)
  })

  it('should return false for stop loss types', () => {
    expect(isTakeProfitOrder({ type: OrderType.STOP_MARKET })).toBe(false)
    expect(isTakeProfitOrder({ type: OrderType.STOP_LIMIT })).toBe(false)
  })

  it('should return false for regular order types', () => {
    expect(isTakeProfitOrder({ type: OrderType.LIMIT })).toBe(false)
    expect(isTakeProfitOrder({ type: OrderType.MARKET })).toBe(false)
  })
})

describe('isStopLossOrder', () => {
  it('should detect STOP_MARKET', () => {
    expect(isStopLossOrder({ type: OrderType.STOP_MARKET })).toBe(true)
  })

  it('should detect STOP_LIMIT', () => {
    expect(isStopLossOrder({ type: OrderType.STOP_LIMIT })).toBe(true)
  })

  it('should return false for take profit types', () => {
    expect(isStopLossOrder({ type: OrderType.TAKE_PROFIT_MARKET })).toBe(false)
    expect(isStopLossOrder({ type: OrderType.TAKE_PROFIT_LIMIT })).toBe(false)
  })

  it('should return false for regular order types', () => {
    expect(isStopLossOrder({ type: OrderType.LIMIT })).toBe(false)
    expect(isStopLossOrder({ type: OrderType.MARKET })).toBe(false)
  })
})

describe('isTpSlOrder', () => {
  it('should return true for all trigger types', () => {
    expect(isTpSlOrder({ type: OrderType.TAKE_PROFIT_MARKET })).toBe(true)
    expect(isTpSlOrder({ type: OrderType.TAKE_PROFIT_LIMIT })).toBe(true)
    expect(isTpSlOrder({ type: OrderType.STOP_MARKET })).toBe(true)
    expect(isTpSlOrder({ type: OrderType.STOP_LIMIT })).toBe(true)
  })

  it('should return false for regular order types', () => {
    expect(isTpSlOrder({ type: OrderType.LIMIT })).toBe(false)
    expect(isTpSlOrder({ type: OrderType.MARKET })).toBe(false)
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
})
