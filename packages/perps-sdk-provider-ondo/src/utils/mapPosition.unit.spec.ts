import type { MarketDisplay } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { OnPosition } from '../types/wire.js'
import { mapOpenPositions, mapPosition } from './mapPosition.js'

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

const positionFixture = (overrides?: Partial<OnPosition>): OnPosition => ({
  market: 'AAPL-USD.P',
  direction: 'long',
  netQuantity: '10',
  averageEntryPrice: '200.5',
  usedMargin: '401',
  unrealizedPnl: '15.5',
  markPrice: '202.05',
  liquidationPrice: '182.3',
  bankruptcyPrice: '180.5',
  maintenanceMargin: '40.1',
  notionalValue: '2020.5',
  leverage: '5',
  netFundingSinceNeutral: '-0.12',
  returnOnEquity: '0.0386',
  ...overrides,
})

describe('mapPosition', () => {
  it('maps a long Ondo position to the generic Position shape', () => {
    expect(mapPosition(positionFixture(), MARKET)).toEqual({
      market: MARKET,
      side: PositionSide.LONG,
      size: '10',
      entryPrice: '200.5',
      markPrice: '202.05',
      liquidationPrice: '182.3',
      unrealizedPnl: '15.5',
      leverage: 5,
      marginUsed: '401',
      marginMode: MarginMode.CROSS,
    })
  })

  it('maps a short position and takes the size magnitude', () => {
    const mapped = mapPosition(
      positionFixture({ direction: 'short', netQuantity: '-2.5' }),
      MARKET
    )
    expect(mapped.side).toBe(PositionSide.SHORT)
    expect(mapped.size).toBe('2.5')
  })

  it('parses fractional leverage', () => {
    expect(
      mapPosition(positionFixture({ leverage: '3.7' }), MARKET).leverage
    ).toBe(3.7)
  })
})

describe('mapOpenPositions', () => {
  it('drops neutral and zero-quantity rows', () => {
    const rows = [
      positionFixture(),
      positionFixture({
        market: 'TSLA-USD.P',
        direction: 'neutral',
        netQuantity: '0',
      }),
      positionFixture({ market: 'NVDA-USD.P', netQuantity: '0' }),
    ]
    const mapped = mapOpenPositions(rows, () => MARKET)
    expect(mapped).toHaveLength(1)
    expect(mapped[0]?.size).toBe('10')
  })

  it('resolves each market through the provided resolver', () => {
    const seen: string[] = []
    mapOpenPositions([positionFixture()], (market) => {
      seen.push(market)
      return MARKET
    })
    expect(seen).toEqual(['AAPL-USD.P'])
  })
})
