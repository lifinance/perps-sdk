import {
  FillClassification,
  type Order,
  type OrderBase,
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
  TriggerCondition,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import {
  ACTIVE_ORDER_STATUSES,
  classifyFill,
  isRegularOrder,
  isStopLossOrder,
  isTakeProfitOrder,
  isTpSlOrder,
  isTriggerOrder,
  isTwapOrder,
  triggerConditionFor,
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

describe('Order union classification', () => {
  const base: OrderBase = {
    orderId: '1',
    market: {
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
    },
    side: OrderSide.SELL,
    status: OrderStatus.OPEN,
    originalSize: '1',
    remainingSize: '1',
    filledSize: '0',
    reduceOnly: false,
    createdAt: '2026-09-15T00:00:00Z',
    updatedAt: '2026-09-15T00:00:00Z',
  }
  const orders: Order[] = [
    {
      ...base,
      type: OrderType.LIMIT,
      price: '100',
      timeInForce: TimeInForce.GTC,
    },
    { ...base, type: OrderType.MARKET, timeInForce: TimeInForce.IOC },
    {
      ...base,
      type: OrderType.STOP_LIMIT,
      triggerPrice: '80',
      triggerCondition: TriggerCondition.BELOW,
      limitPrice: '79',
    },
    {
      ...base,
      type: OrderType.STOP_MARKET,
      triggerPrice: '80',
      triggerCondition: TriggerCondition.BELOW,
    },
    {
      ...base,
      type: OrderType.TAKE_PROFIT_LIMIT,
      triggerPrice: '120',
      triggerCondition: TriggerCondition.ABOVE,
      limitPrice: '121',
    },
    {
      ...base,
      type: OrderType.TAKE_PROFIT_MARKET,
      triggerPrice: '120',
      triggerCondition: TriggerCondition.ABOVE,
    },
    {
      ...base,
      type: OrderType.TWAP,
      durationSeconds: 60,
      startedAt: base.createdAt,
    },
  ]
  it('narrows every variant into exactly one order family', () => {
    expect(
      orders.filter(isRegularOrder).map((order) => order.timeInForce)
    ).toEqual([TimeInForce.GTC, TimeInForce.IOC])
    expect(
      orders.filter(isTriggerOrder).map((order) => order.triggerPrice)
    ).toEqual(['80', '80', '120', '120'])
    expect(
      orders.filter(isTwapOrder).map((order) => order.durationSeconds)
    ).toEqual([60])
  })
  it.each([
    [OrderType.TAKE_PROFIT_MARKET, OrderSide.SELL, TriggerCondition.ABOVE],
    [OrderType.TAKE_PROFIT_LIMIT, OrderSide.BUY, TriggerCondition.BELOW],
    [OrderType.STOP_MARKET, OrderSide.SELL, TriggerCondition.BELOW],
    [OrderType.STOP_LIMIT, OrderSide.BUY, TriggerCondition.ABOVE],
  ] as const)('derives %s/%s as %s', (type, side, expected) => {
    expect(triggerConditionFor(type, side)).toBe(expected)
  })
  it('includes only nonterminal lifecycle statuses by default', () => {
    expect([...ACTIVE_ORDER_STATUSES].sort()).toEqual(
      [
        OrderStatus.ACCEPTED,
        OrderStatus.PENDING,
        OrderStatus.OPEN,
        OrderStatus.PARTIALLY_FILLED,
        OrderStatus.TRIGGERED,
      ].sort()
    )
  })
})
