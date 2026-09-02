import { describe, expect, it } from 'vitest'
import { mapMarketOrderLimits } from './marketLimits.js'

describe('mapMarketOrderLimits', () => {
  it('maps Lighter order_quote_limit to both order-type caps', () => {
    const result = mapMarketOrderLimits({
      order_quote_limit: '2500000',
    })

    expect(result).toEqual({
      maxMarketOrderUsd: '2500000',
      maxLimitOrderUsd: '2500000',
    })
  })

  it('passes a zero cap through unchanged', () => {
    expect(mapMarketOrderLimits({ order_quote_limit: '0' })).toEqual({
      maxMarketOrderUsd: '0',
      maxLimitOrderUsd: '0',
    })
  })

  it('leaves both caps unset for the Lighter no-cap sentinel', () => {
    expect(
      mapMarketOrderLimits({ order_quote_limit: '281474976.710655' })
    ).toEqual({})
  })
})
