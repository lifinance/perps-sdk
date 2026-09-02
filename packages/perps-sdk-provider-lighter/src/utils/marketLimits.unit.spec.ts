import { describe, expect, it } from 'vitest'
import { mapMarketOrderLimits } from './marketLimits.js'

describe('mapMarketOrderLimits', () => {
  it('maps Lighter order_quote_limit to both order-type caps', () => {
    const result = mapMarketOrderLimits({
      order_quote_limit: '281474976.710655',
    })

    expect(result).toEqual({
      maxMarketOrderUsd: '281474976.710655',
      maxLimitOrderUsd: '281474976.710655',
    })
  })
})
