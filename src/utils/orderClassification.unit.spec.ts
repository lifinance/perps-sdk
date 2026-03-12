import { OrderSide } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import {
  classifyFill,
  isStopLossOrder,
  isTakeProfitOrder,
  isTpSlOrder,
} from './orderClassification.js'

describe('isTakeProfitOrder', () => {
  it('should detect TP via structured fields and label', () => {
    expect(
      isTakeProfitOrder({
        providerData: {
          isPositionTpsl: true,
          triggerCondition: 'ABOVE',
          label: 'Take Profit Limit',
        },
      })
    ).toBe(true)
  })

  it('should detect TP via label fallback', () => {
    expect(
      isTakeProfitOrder({
        providerData: { label: 'Take Profit Limit' },
      })
    ).toBe(true)
  })

  it('should return false for stop loss orders', () => {
    expect(
      isTakeProfitOrder({
        providerData: {
          isPositionTpsl: true,
          triggerCondition: 'BELOW',
          label: 'Stop Loss Limit',
        },
      })
    ).toBe(false)
  })

  it('should return false when providerData is undefined', () => {
    expect(isTakeProfitOrder({ providerData: undefined })).toBe(false)
  })

  it('should return false when providerData has no label', () => {
    expect(isTakeProfitOrder({ providerData: {} })).toBe(false)
  })

  it('should return false for regular limit orders', () => {
    expect(
      isTakeProfitOrder({
        providerData: { label: 'Limit', isTrigger: false },
      })
    ).toBe(false)
  })

  it('should handle label with "Take Profit" substring', () => {
    expect(
      isTakeProfitOrder({
        providerData: { label: 'Some Take Profit Order' },
      })
    ).toBe(true)
  })
})

describe('isStopLossOrder', () => {
  it('should detect SL via structured fields and label', () => {
    expect(
      isStopLossOrder({
        providerData: {
          isPositionTpsl: true,
          triggerCondition: 'BELOW',
          label: 'Stop Loss Limit',
        },
      })
    ).toBe(true)
  })

  it('should detect SL via label fallback', () => {
    expect(
      isStopLossOrder({
        providerData: { label: 'Stop Market' },
      })
    ).toBe(true)
  })

  it('should return false for take profit orders', () => {
    expect(
      isStopLossOrder({
        providerData: {
          isPositionTpsl: true,
          triggerCondition: 'ABOVE',
          label: 'Take Profit Limit',
        },
      })
    ).toBe(false)
  })

  it('should return false when providerData is undefined', () => {
    expect(isStopLossOrder({ providerData: undefined })).toBe(false)
  })

  it('should return false when providerData has no label', () => {
    expect(isStopLossOrder({ providerData: {} })).toBe(false)
  })

  it('should return false for regular limit orders', () => {
    expect(
      isStopLossOrder({
        providerData: { label: 'Limit', isTrigger: false },
      })
    ).toBe(false)
  })

  it('should match "Stop" substring in label', () => {
    expect(
      isStopLossOrder({
        providerData: { label: 'Stop Limit' },
      })
    ).toBe(true)
  })
})

describe('isTpSlOrder', () => {
  it('should return true for take profit orders', () => {
    expect(
      isTpSlOrder({
        providerData: { label: 'Take Profit Limit' },
      })
    ).toBe(true)
  })

  it('should return true for stop loss orders', () => {
    expect(
      isTpSlOrder({
        providerData: { label: 'Stop Loss Limit' },
      })
    ).toBe(true)
  })

  it('should return false for regular orders', () => {
    expect(
      isTpSlOrder({
        providerData: { label: 'Limit' },
      })
    ).toBe(false)
  })

  it('should return false when providerData is undefined', () => {
    expect(isTpSlOrder({ providerData: undefined })).toBe(false)
  })
})

describe('classifyFill', () => {
  it('should classify BUY with no PnL as opened-long', () => {
    expect(classifyFill(OrderSide.BUY, null)).toBe('opened-long')
    expect(classifyFill(OrderSide.BUY, undefined)).toBe('opened-long')
  })

  it('should classify BUY with zero PnL as opened-long', () => {
    expect(classifyFill(OrderSide.BUY, '0')).toBe('opened-long')
  })

  it('should classify BUY with non-zero PnL as closed-short', () => {
    expect(classifyFill(OrderSide.BUY, '150.50')).toBe('closed-short')
    expect(classifyFill(OrderSide.BUY, '-50.25')).toBe('closed-short')
  })

  it('should classify SELL with no PnL as opened-short', () => {
    expect(classifyFill(OrderSide.SELL, null)).toBe('opened-short')
    expect(classifyFill(OrderSide.SELL, undefined)).toBe('opened-short')
  })

  it('should classify SELL with zero PnL as opened-short', () => {
    expect(classifyFill(OrderSide.SELL, '0')).toBe('opened-short')
  })

  it('should classify SELL with non-zero PnL as closed-long', () => {
    expect(classifyFill(OrderSide.SELL, '200.00')).toBe('closed-long')
    expect(classifyFill(OrderSide.SELL, '-100.00')).toBe('closed-long')
  })

  it('should treat very small non-zero PnL as a close', () => {
    expect(classifyFill(OrderSide.BUY, '0.01')).toBe('closed-short')
    expect(classifyFill(OrderSide.SELL, '-0.001')).toBe('closed-long')
  })

  it('should treat "0.0" as zero (not a close)', () => {
    // parseFloat("0.0") === 0
    expect(classifyFill(OrderSide.BUY, '0.0')).toBe('opened-long')
    expect(classifyFill(OrderSide.SELL, '0.00')).toBe('opened-short')
  })
})
