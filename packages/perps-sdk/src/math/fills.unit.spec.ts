import {
  type Fill,
  FillClassification,
  LiquidityRole,
  OrderSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import {
  calculateAverageFillPrice,
  classifyFillFromPosition,
  formatFillAmountSign,
  formatFillCardLabel,
  formatFillTableLabel,
  isClosingFillClassification,
  isLongSideFillClassification,
} from './fills.js'

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

interface TaxonomyCase {
  c: FillClassification
  closing: boolean
  long: boolean
  card: string
  table: string
  sign: '+' | '-' | ''
}

const taxonomy: TaxonomyCase[] = [
  {
    c: FillClassification.OPENED_LONG,
    closing: false,
    long: true,
    card: 'Opened long',
    table: 'Open long',
    sign: '',
  },
  {
    c: FillClassification.INCREASED_LONG,
    closing: false,
    long: true,
    card: 'Increased long',
    table: 'Increase long',
    sign: '+',
  },
  {
    c: FillClassification.REDUCED_LONG,
    closing: true,
    long: true,
    card: 'Reduced long',
    table: 'Reduce long',
    sign: '-',
  },
  {
    c: FillClassification.CLOSED_LONG,
    closing: true,
    long: true,
    card: 'Closed long',
    table: 'Close long',
    sign: '',
  },
  {
    c: FillClassification.SWITCHED_LONG,
    closing: true,
    long: true,
    card: 'Switched to long',
    table: 'Switch to long',
    sign: '',
  },
  {
    c: FillClassification.OPENED_SHORT,
    closing: false,
    long: false,
    card: 'Opened short',
    table: 'Open short',
    sign: '',
  },
  {
    c: FillClassification.INCREASED_SHORT,
    closing: false,
    long: false,
    card: 'Increased short',
    table: 'Increase short',
    sign: '+',
  },
  {
    c: FillClassification.REDUCED_SHORT,
    closing: true,
    long: false,
    card: 'Reduced short',
    table: 'Reduce short',
    sign: '-',
  },
  {
    c: FillClassification.CLOSED_SHORT,
    closing: true,
    long: false,
    card: 'Closed short',
    table: 'Close short',
    sign: '',
  },
  {
    c: FillClassification.SWITCHED_SHORT,
    closing: true,
    long: false,
    card: 'Switched to short',
    table: 'Switch to short',
    sign: '',
  },
  {
    c: FillClassification.SPOT_BUY,
    closing: false,
    long: true,
    card: 'Bought',
    table: 'Buy',
    sign: '',
  },
  {
    c: FillClassification.SPOT_SELL,
    closing: false,
    long: false,
    card: 'Sold',
    table: 'Sell',
    sign: '',
  },
  {
    c: FillClassification.BUY,
    closing: false,
    long: true,
    card: 'Bought',
    table: 'Buy',
    sign: '',
  },
  {
    c: FillClassification.SELL,
    closing: false,
    long: false,
    card: 'Sold',
    table: 'Sell',
    sign: '',
  },
]

describe('fill taxonomy helpers', () => {
  it('covers every FillClassification member', () => {
    expect(taxonomy.map((row) => row.c).sort()).toEqual(
      Object.values(FillClassification).sort()
    )
  })

  it.each(taxonomy)('isClosingFillClassification($c) is $closing', ({
    c,
    closing,
  }) => {
    expect(isClosingFillClassification(c)).toBe(closing)
  })

  it.each(taxonomy)('isLongSideFillClassification($c) is $long', ({
    c,
    long,
  }) => {
    expect(isLongSideFillClassification(c)).toBe(long)
  })

  it.each(taxonomy)('formatFillCardLabel($c) is "$card"', ({ c, card }) => {
    expect(formatFillCardLabel(c)).toBe(card)
  })

  it.each(taxonomy)('formatFillTableLabel($c) is "$table"', ({ c, table }) => {
    expect(formatFillTableLabel(c)).toBe(table)
  })

  it.each(taxonomy)('formatFillAmountSign($c) is "$sign"', ({ c, sign }) => {
    expect(formatFillAmountSign(c)).toBe(sign)
  })
})

const asset = (id: string) => ({
  providerId: 'venue',
  id,
  displaySymbol: id,
  logoURI: '',
})

const fill = (size: string, price: string): Fill => ({
  id: `${size}@${price}`,
  orderId: '1',
  market: {
    providerId: 'venue',
    id: 'ETH',
    categoryId: 'perps',
    baseAsset: asset('ETH'),
    quoteAsset: asset('USDC'),
  },
  side: OrderSide.BUY,
  size,
  price,
  liquidity: LiquidityRole.TAKER,
  classification: FillClassification.OPENED_LONG,
  createdAt: '2026-10-15T00:00:00.000Z',
})

describe('calculateAverageFillPrice', () => {
  it('gives the exact average for a quotient that does not terminate', () => {
    // (0.1 × 1000 + 0.2 × 3128.3) / 0.3 = 725.66 / 0.3
    expect(
      calculateAverageFillPrice([fill('0.1', '1000'), fill('0.2', '3128.3')])
    ).toBe('2418.8666666666666666666666666666666666666667')
  })

  it('gives the price of a single fill', () => {
    expect(calculateAverageFillPrice([fill('0.5', '61729.66')])).toBe(
      '61729.66'
    )
  })

  it('skips a fill whose size or price does not match the decimal pattern', () => {
    expect(
      calculateAverageFillPrice([
        fill('1', '100'),
        fill('NaN', '1'),
        fill('1', ''),
        fill('3', '200'),
      ])
    ).toBe('175')
  })

  it('gives undefined for no fills', () => {
    expect(calculateAverageFillPrice([])).toBeUndefined()
  })

  it('gives undefined when the summed size is zero', () => {
    expect(
      calculateAverageFillPrice([fill('0', '100'), fill('0.0', '200')])
    ).toBeUndefined()
  })

  it('gives undefined when every fill is malformed', () => {
    expect(calculateAverageFillPrice([fill('x', '100')])).toBeUndefined()
  })
})
