import {
  type Fill,
  FillClassification,
  LiquidityRole,
  OrderSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import {
  buildFill,
  calculateAverageFillPrice,
  calculateFillClosedSize,
  classifyFillFromPosition,
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

const closingFill = (overrides: Partial<Fill>): Fill => ({
  ...fill('1', '110'),
  side: OrderSide.SELL,
  startPosition: '1',
  classification: FillClassification.CLOSED_LONG,
  realizedPnl: '10',
  ...overrides,
})

describe('calculateFillClosedSize', () => {
  it.each([
    ['a full close of a long', '1', OrderSide.SELL, '1', '1'],
    ['a full close of a short', '-1', OrderSide.BUY, '1', '1'],
    ['a partial close of a long', '2', OrderSide.SELL, '0.5', '0.5'],
    ['a partial close of a short', '-2', OrderSide.BUY, '0.5', '0.5'],
    ['a flip from long to short', '1', OrderSide.SELL, '3', '1'],
    ['a flip from short to long', '-0.25', OrderSide.BUY, '1', '0.25'],
  ])('gives the closed part of %s', (_case, startPosition, side, size, closed) => {
    expect(
      calculateFillClosedSize({
        size,
        startPosition,
        classification: classifyFillFromPosition(startPosition, side, size),
      })
    ).toBe(closed)
  })

  it.each([
    ['an opening fill', '0', OrderSide.BUY],
    ['an increase of a long', '1', OrderSide.BUY],
    ['an increase of a short', '-1', OrderSide.SELL],
  ])('gives undefined for %s', (_case, startPosition, side) => {
    expect(
      calculateFillClosedSize({
        size: '1',
        startPosition,
        classification: classifyFillFromPosition(startPosition, side, '1'),
      })
    ).toBeUndefined()
  })

  it.each([
    FillClassification.CLOSED_LONG,
    FillClassification.CLOSED_SHORT,
    FillClassification.REDUCED_LONG,
    FillClassification.REDUCED_SHORT,
  ])('gives the full size of a %s fill without startPosition', (classification) => {
    expect(calculateFillClosedSize({ size: '2', classification })).toBe('2')
  })

  it.each([
    FillClassification.SWITCHED_LONG,
    FillClassification.SWITCHED_SHORT,
    FillClassification.OPENED_LONG,
    FillClassification.BUY,
  ])('gives undefined for a %s fill without startPosition', (classification) => {
    expect(
      calculateFillClosedSize({ size: '2', classification })
    ).toBeUndefined()
  })

  it('gives undefined for a spot fill', () => {
    expect(
      calculateFillClosedSize({
        size: '1',
        startPosition: '5',
        classification: FillClassification.SPOT_SELL,
      })
    ).toBeUndefined()
  })

  it.each([
    { size: 'abc', startPosition: '1' },
    { size: '0', startPosition: '1' },
    { size: '1', startPosition: '1e-8' },
  ])('gives undefined for the malformed input %j', (input) => {
    expect(
      calculateFillClosedSize({
        ...input,
        classification: FillClassification.CLOSED_LONG,
      })
    ).toBeUndefined()
  })
})

describe('buildFill', () => {
  it('calculates the closed size, the entry price and the ROE of a full close of a long', () => {
    expect(buildFill(closingFill({}), '5')).toMatchObject({
      closedSize: '1',
      entryPrice: '100',
      returnOnEquity: '50',
    })
  })

  it('calculates the fields of a partial close of a short', () => {
    expect(
      buildFill(
        closingFill({
          side: OrderSide.BUY,
          size: '1',
          price: '90',
          startPosition: '-2',
          classification: FillClassification.REDUCED_SHORT,
          realizedPnl: '10',
        }),
        '10'
      )
    ).toMatchObject({
      closedSize: '1',
      entryPrice: '100',
      returnOnEquity: '100',
    })
  })

  it('uses only the closed part of a flip', () => {
    expect(
      buildFill(
        closingFill({
          size: '3',
          price: '120',
          classification: FillClassification.SWITCHED_SHORT,
          realizedPnl: '20',
        }),
        '2'
      )
    ).toMatchObject({
      closedSize: '1',
      entryPrice: '100',
      returnOnEquity: '40',
    })
  })

  it('gives a negative ROE for a loss', () => {
    expect(
      buildFill(closingFill({ price: '90', realizedPnl: '-10' }), '5')
    ).toMatchObject({
      closedSize: '1',
      entryPrice: '100',
      returnOnEquity: '-50',
    })
  })

  it('uses the full size of a close without startPosition', () => {
    expect(
      buildFill(
        closingFill({
          size: '2',
          price: '105',
          startPosition: undefined,
          realizedPnl: '10',
        }),
        '4'
      )
    ).toMatchObject({
      closedSize: '2',
      entryPrice: '100',
      returnOnEquity: '20',
    })
  })

  it('gives none of the fields for a flip without startPosition', () => {
    const built = buildFill(
      closingFill({
        size: '3',
        startPosition: undefined,
        classification: FillClassification.SWITCHED_SHORT,
      }),
      '5'
    )
    expect(built).not.toHaveProperty('closedSize')
    expect(built).not.toHaveProperty('entryPrice')
    expect(built).not.toHaveProperty('returnOnEquity')
  })

  it('removes stale fields from an opening fill', () => {
    const built = buildFill(
      {
        ...fill('1', '100'),
        startPosition: '0',
        closedSize: '1',
        entryPrice: '90',
        returnOnEquity: '10',
      },
      '5'
    )
    expect(built).not.toHaveProperty('closedSize')
    expect(built).not.toHaveProperty('entryPrice')
    expect(built).not.toHaveProperty('returnOnEquity')
  })

  it('keeps a positive input entry price', () => {
    expect(buildFill(closingFill({ entryPrice: '125' }), '5')).toMatchObject({
      entryPrice: '125',
      returnOnEquity: '40',
    })
  })

  it('calculates the entry price when the input entry price is not positive', () => {
    expect(buildFill(closingFill({ entryPrice: '0' }), '5')).toMatchObject({
      entryPrice: '100',
    })
  })

  it('counts a null realized PnL as zero', () => {
    expect(
      buildFill(closingFill({ price: '100', realizedPnl: null }), '5')
    ).toMatchObject({ entryPrice: '100', returnOnEquity: '0' })
  })

  it.each([
    undefined,
    '0',
    '-2',
    'abc',
  ])('gives no ROE for the leverage %j', (leverage) => {
    const built = buildFill(closingFill({}), leverage)
    expect(built).toMatchObject({ closedSize: '1', entryPrice: '100' })
    expect(built).not.toHaveProperty('returnOnEquity')
  })

  it.each([
    undefined,
    'abc',
  ])('gives only the closed size for the realized PnL %j', (realizedPnl) => {
    const built = buildFill(closingFill({ realizedPnl }), '5')
    expect(built.closedSize).toBe('1')
    expect(built).not.toHaveProperty('entryPrice')
    expect(built).not.toHaveProperty('returnOnEquity')
  })

  it('gives no entry price when the calculated price is not positive', () => {
    const built = buildFill(
      closingFill({ price: '10', realizedPnl: '20' }),
      '5'
    )
    expect(built.closedSize).toBe('1')
    expect(built).not.toHaveProperty('entryPrice')
    expect(built).not.toHaveProperty('returnOnEquity')
  })

  it('gives the same fill when it builds a built fill again', () => {
    const built = buildFill(closingFill({}), '5')
    expect(buildFill(built, '5')).toEqual(built)
  })

  it('does not change its input', () => {
    const input = closingFill({})
    const copy = { ...input }
    buildFill(input, '5')
    expect(input).toEqual(copy)
  })
})
