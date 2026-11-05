import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveTradePrice } from './tradePrice.js'

// Live mainnet deleverage row of market 182: `usd_amount / size`, at 40
// places half-up.
const DELEVERAGE_ROW = {
  type: 'deleverage',
  price: '0.0000',
  size: '445.00',
  usd_amount: '1315.774894',
}
const DELEVERAGE_PRICE = '2.9567975146067415730337078651685393258427'

describe('resolveTradePrice', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prices a zero-price deleverage row at usd_amount / size', () => {
    expect(resolveTradePrice(DELEVERAGE_ROW)).toBe(DELEVERAGE_PRICE)
  })

  it.each([
    [
      'a non-zero deleverage price',
      { ...DELEVERAGE_ROW, price: '2.9568' },
      '2.9568',
    ],
    [
      'a zero price on a trade row',
      { ...DELEVERAGE_ROW, type: 'trade' },
      '0.0000',
    ],
    [
      'a liquidation price',
      { ...DELEVERAGE_ROW, type: 'liquidation', price: '2.95' },
      '2.95',
    ],
  ])('keeps %s', (_label, row, price) => {
    expect(resolveTradePrice(row)).toBe(price)
  })

  it.each([
    [
      'usd_amount is malformed',
      { ...DELEVERAGE_ROW, usd_amount: '1,315.774894' },
    ],
    ['size is zero', { ...DELEVERAGE_ROW, size: '0' }],
  ])('keeps the venue price when %s', (_label, row) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveTradePrice(row)).toBe('0.0000')
    expect(warn).toHaveBeenCalledOnce()
  })
})
