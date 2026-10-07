import type { Fill, MarketDisplay } from '@lifi/perps-types'
import { FillClassification, LiquidityRole, OrderSide } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import type { OndoFill } from '../types/wire.js'
import { mapFill } from './mapFill.js'

const mapValidFill = (...args: Parameters<typeof mapFill>): Fill => {
  const fill = mapFill(...args)
  if (fill === undefined) {
    throw new Error('mapFill skipped a valid row')
  }
  return fill
}

const MARKET: MarketDisplay = {
  providerId: 'ondo',
  id: 'AAPL-USD.P',
  categoryId: 'ondo',
  baseAsset: {
    providerId: 'ondo',
    id: 'AAPL',
    displaySymbol: 'AAPL',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'ondo',
    id: 'USD',
    displaySymbol: 'USD',
    logoURI: '',
  },
}

const fillFixture = (overrides?: Partial<OndoFill>): OndoFill => ({
  id: 'fill-1',
  orderId: 'ord-1',
  market: 'AAPL-USD.P',
  price: '200.5',
  size: '4',
  side: 'buy',
  filledCost: '802',
  fee: '0.4',
  time: '2026-07-01T12:00:00Z',
  isMaker: false,
  direction: 'openLong',
  ...overrides,
})

describe('mapFill', () => {
  it('maps an Ondo fill to the generic Fill shape', () => {
    expect(mapValidFill(fillFixture(), MARKET)).toEqual({
      id: 'fill-1',
      orderId: 'ord-1',
      market: MARKET,
      side: OrderSide.BUY,
      size: '4',
      price: '200.5',
      liquidity: LiquidityRole.TAKER,
      fee: { amount: '0.4', asset: 'USD' },
      realizedPnl: undefined,
      classification: FillClassification.OPENED_LONG,
      createdAt: '2026-07-01T12:00:00.000Z',
    })
  })

  it('maps maker role and sell side', () => {
    const mapped = mapValidFill(
      fillFixture({ side: 'sell', isMaker: true, direction: 'closeLong' }),
      MARKET
    )
    expect(mapped.side).toBe(OrderSide.SELL)
    expect(mapped.liquidity).toBe(LiquidityRole.MAKER)
  })

  it('maps every direction to its FillClassification', () => {
    const cases: Array<[OndoFill['direction'], FillClassification]> = [
      ['openLong', FillClassification.OPENED_LONG],
      ['openShort', FillClassification.OPENED_SHORT],
      ['closeLong', FillClassification.CLOSED_LONG],
      ['closeShort', FillClassification.CLOSED_SHORT],
      ['flipLongToShort', FillClassification.SWITCHED_SHORT],
      ['flipShortToLong', FillClassification.SWITCHED_LONG],
    ]
    for (const [direction, expected] of cases) {
      expect(
        mapValidFill(fillFixture({ direction }), MARKET).classification
      ).toBe(expected)
    }
  })

  it('classifies by side alone when direction is absent', () => {
    expect(
      mapValidFill(fillFixture({ direction: undefined }), MARKET).classification
    ).toBe(FillClassification.BUY)
    expect(
      mapValidFill(fillFixture({ direction: undefined, side: 'sell' }), MARKET)
        .classification
    ).toBe(FillClassification.SELL)
  })

  it('nets the fee against a rebate', () => {
    expect(mapValidFill(fillFixture({ feeRebate: '0.1' }), MARKET).fee).toEqual(
      {
        amount: '0.3',
        asset: 'USD',
      }
    )
  })

  it("reads the fee asset from the market's quote asset", () => {
    const mapped = mapValidFill(fillFixture(), {
      ...MARKET,
      quoteAsset: { ...MARKET.quoteAsset, displaySymbol: 'USDC' },
    })
    expect(mapped.fee).toEqual({ amount: '0.4', asset: 'USDC' })
  })

  it('carries realized pnl through', () => {
    expect(mapValidFill(fillFixture({ pnl: '12.5' }), MARKET).realizedPnl).toBe(
      '12.5'
    )
  })

  it('carries the wire client order ID into clientOrderId', () => {
    expect(
      mapValidFill(fillFixture({ clientOrderId: 'client-order-1' }), MARKET)
        .clientOrderId
    ).toBe('client-order-1')
  })

  it('leaves clientOrderId undefined when the wire omits it', () => {
    expect(mapValidFill(fillFixture(), MARKET).clientOrderId).toBeUndefined()
  })

  // An Ondo fill carries no leverage and no margin fraction; the venue reports
  // leverage on the position and the balance summary only.
  it('omits the leverage key on every fill', () => {
    expect(Object.keys(mapValidFill(fillFixture(), MARKET))).not.toContain(
      'leverage'
    )
    expect(
      Object.keys(
        mapValidFill(
          fillFixture({ side: 'sell', direction: 'closeLong' }),
          MARKET
        )
      )
    ).not.toContain('leverage')
  })

  it.each([
    'fee',
    'feeRebate',
  ] as const)('maps the fill without a fee when %s is malformed', (field) => {
    const mapped = mapValidFill(fillFixture({ [field]: '10oops' }), MARKET)
    expect(mapped.fee).toBeUndefined()
    expect(mapped.id).toBe(fillFixture().id)
    expect(mapped.classification).toBe(FillClassification.OPENED_LONG)
  })
})

describe('mapFill invalid rows', () => {
  it.each([
    ['size', { size: '4 units' }],
    ['price', { price: 'NaN' }],
    ['time', { time: 'not a time' }],
  ] satisfies [
    string,
    Partial<OndoFill>,
  ][])('skips a fill with an invalid %s and warns', (_field, overrides) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(mapFill(fillFixture(overrides), MARKET)).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
