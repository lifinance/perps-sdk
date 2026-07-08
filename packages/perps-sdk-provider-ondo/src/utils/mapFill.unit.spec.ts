import type { MarketDisplay } from '@lifi/perps-types'
import {
  FillClassification,
  FillStatus,
  LiquidityRole,
  OrderSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { OndoFill } from '../types/wire.js'
import { mapFill } from './mapFill.js'

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
    expect(mapFill(fillFixture(), MARKET)).toEqual({
      id: 'fill-1',
      orderId: 'ord-1',
      market: MARKET,
      side: OrderSide.BUY,
      size: '4',
      price: '200.5',
      status: FillStatus.FILLED,
      liquidity: LiquidityRole.TAKER,
      fee: '0.4',
      realizedPnl: undefined,
      classification: FillClassification.OPENED_LONG,
      createdAt: '2026-07-01T12:00:00.000Z',
    })
  })

  it('maps maker role and sell side', () => {
    const mapped = mapFill(
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
      expect(mapFill(fillFixture({ direction }), MARKET).classification).toBe(
        expected
      )
    }
  })

  it('falls back to side-based classification when direction is absent', () => {
    expect(
      mapFill(fillFixture({ direction: undefined }), MARKET).classification
    ).toBe(FillClassification.OPENED_LONG)
    expect(
      mapFill(fillFixture({ direction: undefined, side: 'sell' }), MARKET)
        .classification
    ).toBe(FillClassification.OPENED_SHORT)
  })

  it('nets the fee against a rebate', () => {
    expect(mapFill(fillFixture({ feeRebate: '0.1' }), MARKET).fee).toBe('0.3')
  })

  it('carries realized pnl through', () => {
    expect(mapFill(fillFixture({ pnl: '12.5' }), MARKET).realizedPnl).toBe(
      '12.5'
    )
  })
})
