import { describe, expect, it } from 'vitest'

import {
  FillClassification,
  FillStatus,
  OrderSide,
  OrderType,
} from '../../../enums.js'
import type { HlUserFill } from '../types.js'
import { classifyFillFromPosition, mapFill } from './fill.js'

const baseFill = (overrides: Partial<HlUserFill> = {}): HlUserFill => ({
  tid: 12345,
  oid: 67890,
  coin: 'ETH',
  side: 'B',
  sz: '1',
  px: '1000',
  dir: 'Open Long',
  fee: '0.5',
  closedPnl: '0',
  crossed: true,
  time: 1_700_000_000_000,
  startPosition: '0',
  ...overrides,
})

describe('classifyFillFromPosition', () => {
  describe('starting flat (start === 0)', () => {
    it('classifies a buy as OPENED_LONG', () => {
      expect(classifyFillFromPosition('0', 'B', '1')).toBe(
        FillClassification.OPENED_LONG
      )
    })

    it('classifies a sell as OPENED_SHORT', () => {
      expect(classifyFillFromPosition('0', 'A', '1')).toBe(
        FillClassification.OPENED_SHORT
      )
    })
  })

  describe('starting long (start > 0)', () => {
    it('classifies a sell that fully unwinds as CLOSED_LONG', () => {
      expect(classifyFillFromPosition('1', 'A', '1')).toBe(
        FillClassification.CLOSED_LONG
      )
    })

    it('classifies a sell that flips negative as SWITCHED_SHORT', () => {
      expect(classifyFillFromPosition('1', 'A', '2')).toBe(
        FillClassification.SWITCHED_SHORT
      )
    })

    it('classifies a buy that grows the position as INCREASED_LONG', () => {
      expect(classifyFillFromPosition('1', 'B', '1')).toBe(
        FillClassification.INCREASED_LONG
      )
    })

    it('classifies a partial sell as REDUCED_LONG', () => {
      expect(classifyFillFromPosition('2', 'A', '1')).toBe(
        FillClassification.REDUCED_LONG
      )
    })
  })

  describe('starting short (start < 0)', () => {
    it('classifies a buy that fully unwinds as CLOSED_SHORT', () => {
      expect(classifyFillFromPosition('-1', 'B', '1')).toBe(
        FillClassification.CLOSED_SHORT
      )
    })

    it('classifies a buy that flips positive as SWITCHED_LONG', () => {
      expect(classifyFillFromPosition('-1', 'B', '2')).toBe(
        FillClassification.SWITCHED_LONG
      )
    })

    it('classifies a sell that deepens the short as INCREASED_SHORT', () => {
      expect(classifyFillFromPosition('-1', 'A', '1')).toBe(
        FillClassification.INCREASED_SHORT
      )
    })

    it('classifies a partial buy as REDUCED_SHORT', () => {
      expect(classifyFillFromPosition('-2', 'B', '1')).toBe(
        FillClassification.REDUCED_SHORT
      )
    })
  })
})

describe('mapFill (Hyperliquid)', () => {
  it('stringifies the numeric tid into Fill.id', () => {
    const fill = mapFill(baseFill({ tid: 12345 }))
    expect(fill.id).toBe('12345')
    expect(typeof fill.id).toBe('string')
  })

  it('maps side "B" to OrderSide.BUY', () => {
    expect(mapFill(baseFill({ side: 'B' })).side).toBe(OrderSide.BUY)
  })

  it('maps any non-"B" side (e.g. "A") to OrderSide.SELL', () => {
    expect(mapFill(baseFill({ side: 'A' })).side).toBe(OrderSide.SELL)
  })

  it('maps a dir containing "Limit" to OrderType.LIMIT', () => {
    expect(mapFill(baseFill({ dir: 'Open Long Limit' })).type).toBe(
      OrderType.LIMIT
    )
  })

  it('maps a dir without "Limit" to OrderType.MARKET', () => {
    expect(mapFill(baseFill({ dir: 'Open Long' })).type).toBe(OrderType.MARKET)
  })

  it('treats undefined dir as a market fill', () => {
    // `dir` is typed as required, but the live API has been observed to omit
    // it for some entries; the mapper uses optional chaining to fall back to
    // MARKET, which we lock in here.
    expect(
      mapFill(baseFill({ dir: undefined as unknown as string })).type
    ).toBe(OrderType.MARKET)
  })

  it('preserves size, price, and fee as raw strings', () => {
    const fill = mapFill(baseFill({ sz: '1.5', px: '2000.25', fee: '0.123' }))
    expect(fill.size).toBe('1.5')
    expect(fill.filledSize).toBe('1.5')
    expect(fill.price).toBe('2000.25')
    expect(fill.fee).toBe('0.123')
  })

  it('always reports status FILLED', () => {
    expect(mapFill(baseFill()).status).toBe(FillStatus.FILLED)
  })

  it('normalises closedPnl "0" to null', () => {
    expect(mapFill(baseFill({ closedPnl: '0' })).realizedPnl).toBeNull()
  })

  it('passes through a non-zero closedPnl as-is', () => {
    expect(mapFill(baseFill({ closedPnl: '12.34' })).realizedPnl).toBe('12.34')
  })

  it('preserves startPosition for downstream classification', () => {
    expect(mapFill(baseFill({ startPosition: '0.5' })).startPosition).toBe(
      '0.5'
    )
  })

  it('renders the time epoch (ms) as an ISO timestamp', () => {
    const fill = mapFill(baseFill({ time: 1_700_000_000_000 }))
    expect(fill.createdAt).toBe(new Date(1_700_000_000_000).toISOString())
  })

  it('builds the asset display from the coin field', () => {
    const fill = mapFill(baseFill({ coin: 'ETH' }))
    expect(fill.asset).toEqual({
      assetId: 'ETH',
      market: 'hyperliquid',
      displaySymbol: 'ETH',
      displayQuote: null,
    })
  })

  describe('asset.market', () => {
    it('maps a bare coin (main perp dex) to market "hyperliquid"', () => {
      expect(mapFill(baseFill({ coin: 'BTC' })).asset.market).toBe(
        'hyperliquid'
      )
    })

    it('maps a sub-dex prefixed coin (e.g. "xyz:PURR") to the sub-dex name', () => {
      expect(mapFill(baseFill({ coin: 'xyz:PURR' })).asset.market).toBe('xyz')
    })

    it('maps an @-prefixed spot coin to market "spot"', () => {
      expect(mapFill(baseFill({ coin: '@142' })).asset.market).toBe('spot')
    })
  })

  describe('classification', () => {
    it('routes spot fills (coin starts with @) on the buy side to SPOT_BUY', () => {
      const fill = mapFill(baseFill({ coin: '@230', side: 'B' }))
      expect(fill.classification).toBe(FillClassification.SPOT_BUY)
    })

    it('routes spot fills on the sell side to SPOT_SELL', () => {
      const fill = mapFill(baseFill({ coin: '@230', side: 'A' }))
      expect(fill.classification).toBe(FillClassification.SPOT_SELL)
    })

    it('delegates perp fills to classifyFillFromPosition', () => {
      const fill = mapFill(
        baseFill({ coin: 'ETH', side: 'B', sz: '1', startPosition: '0' })
      )
      expect(fill.classification).toBe(FillClassification.OPENED_LONG)
    })
  })
})
