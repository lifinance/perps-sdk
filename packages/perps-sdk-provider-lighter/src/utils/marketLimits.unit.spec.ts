import { describe, expect, it } from 'vitest'
import { mapMarketOrderLimits } from './marketLimits.js'

describe('mapMarketOrderLimits', () => {
  it('maps Lighter order limits to all market order-value fields', () => {
    const result = mapMarketOrderLimits({
      order_quote_limit: '2500000',
      min_quote_amount: '10',
    })

    expect(result).toEqual({
      maxMarketOrderUsd: '2500000',
      maxLimitOrderUsd: '2500000',
      minOrderValueUsd: '10',
    })
  })

  it('passes a zero cap through unchanged', () => {
    expect(
      mapMarketOrderLimits({
        order_quote_limit: '0',
        min_quote_amount: '10',
      })
    ).toEqual({
      maxMarketOrderUsd: '0',
      maxLimitOrderUsd: '0',
      minOrderValueUsd: '10',
    })
  })

  it('keeps the minimum for the Lighter no-cap sentinel', () => {
    expect(
      mapMarketOrderLimits({
        order_quote_limit: '281474976.710655',
        min_quote_amount: '10',
      })
    ).toEqual({
      minOrderValueUsd: '10',
    })
  })
})
