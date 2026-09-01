import type { MarketDisplay } from '@lifi/perps-types'
import {
  FillClassification,
  FillStatus,
  LiquidityRole,
  OrderSide,
  OrderType,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { HlUserFill } from '../types/index.js'
import { classifyFillFromPosition, mapFill } from './mapFill.js'

const ETH_MARKET: MarketDisplay = {
  providerId: 'hyperliquid',
  id: 'ETH',
  categoryId: 'hyperliquid',
  baseAsset: {
    providerId: 'hyperliquid',
    id: 'ETH',
    displaySymbol: 'ETH',
    logoURI: 'https://app.hyperliquid.xyz/coins/ETH.svg',
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: 'https://app.hyperliquid.xyz/coins/USDC.svg',
  },
}

const spotMarket = (id: string): MarketDisplay => ({
  providerId: 'hyperliquid',
  id,
  categoryId: 'spot',
  baseAsset: {
    providerId: 'hyperliquid',
    id,
    displaySymbol: id,
    logoURI: `https://app.hyperliquid.xyz/coins/${id}.svg`,
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: 'https://app.hyperliquid.xyz/coins/USDC.svg',
  },
})

const map = (fill: HlUserFill) => mapFill(fill, ETH_MARKET)

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
    const fill = map(baseFill({ tid: 12345 }))
    expect(fill.id).toBe('12345')
    expect(typeof fill.id).toBe('string')
  })

  it('maps side "B" to OrderSide.BUY', () => {
    expect(map(baseFill({ side: 'B' })).side).toBe(OrderSide.BUY)
  })

  it('maps any non-"B" side (e.g. "A") to OrderSide.SELL', () => {
    expect(map(baseFill({ side: 'A' })).side).toBe(OrderSide.SELL)
  })

  describe('order type from liquidity (crossed)', () => {
    it('classifies a maker fill (crossed: false) as LIMIT — a maker fill can only come from a resting limit order', () => {
      expect(map(baseFill({ crossed: false, dir: 'Open Long' })).type).toBe(
        OrderType.LIMIT
      )
    })

    it('classifies a maker fill as LIMIT regardless of the dir descriptor', () => {
      expect(map(baseFill({ crossed: false, dir: 'Close Short' })).type).toBe(
        OrderType.LIMIT
      )
    })

    it('leaves the order type undefined for taker fills (crossed: true) — market vs aggressive-limit is not derivable from the fill payload', () => {
      expect(
        map(baseFill({ crossed: true, dir: 'Open Long' })).type
      ).toBeUndefined()
    })
  })

  it('preserves size, price, and fee as raw strings', () => {
    const fill = map(baseFill({ sz: '1.5', px: '2000.25', fee: '0.123' }))
    expect(fill.size).toBe('1.5')
    expect(fill.filledSize).toBe('1.5')
    expect(fill.price).toBe('2000.25')
    expect(fill.fee?.amount).toBe('0.123')
  })

  describe('fee asset', () => {
    it('names the wire feeToken as the fee asset', () => {
      expect(map(baseFill({ fee: '0.2', feeToken: 'HYPE' })).fee).toEqual({
        amount: '0.2',
        asset: 'HYPE',
      })
    })

    it("falls back to the market's quote asset when the row carries no feeToken", () => {
      expect(map(baseFill({ fee: '0.2' })).fee).toEqual({
        amount: '0.2',
        asset: 'USDC',
      })
    })

    it('keeps a spot fill fee in the feeToken the venue charged, not the base asset', () => {
      const fill = mapFill(
        baseFill({ coin: 'PURR/USDC', fee: '0.05', feeToken: 'PURR' }),
        spotMarket('PURR/USDC')
      )
      expect(fill.fee).toEqual({ amount: '0.05', asset: 'PURR' })
    })
  })

  describe('builder fee', () => {
    it('carries the builder portion in the same token as the total fee', () => {
      const fill = map(
        baseFill({ fee: '0.5', builderFee: '0.1', feeToken: 'HYPE' })
      )
      expect(fill.fee).toEqual({ amount: '0.5', asset: 'HYPE' })
      expect(fill.builderFee).toEqual({ amount: '0.1', asset: 'HYPE' })
      expect(typeof fill.builderFee?.amount).toBe('string')
    })

    it("falls back to the market's quote asset when the row carries no feeToken", () => {
      expect(
        map(baseFill({ fee: '0.5', builderFee: '0.1' })).builderFee
      ).toEqual({ amount: '0.1', asset: 'USDC' })
    })

    it('leaves builderFee undefined when the row omits it', () => {
      expect(map(baseFill({ fee: '0.5' })).builderFee).toBeUndefined()
    })
  })

  describe('client order ID', () => {
    it('carries the wire cloid into clientOrderId', () => {
      expect(map(baseFill({ cloid: '0xabc123' })).clientOrderId).toBe(
        '0xabc123'
      )
    })

    it('leaves clientOrderId undefined when the row omits the cloid', () => {
      expect(map(baseFill()).clientOrderId).toBeUndefined()
    })
  })

  it('always reports status FILLED', () => {
    expect(map(baseFill()).status).toBe(FillStatus.FILLED)
  })

  // `userFills` carries no leverage and no margin fraction, so the mapper never
  // populates the field.
  it('leaves leverage undefined on every fill', () => {
    expect(map(baseFill()).leverage).toBeUndefined()
    expect(map(baseFill({ crossed: false, startPosition: '3' })).leverage).toBe(
      undefined
    )
  })

  it('normalises closedPnl "0" to null', () => {
    expect(map(baseFill({ closedPnl: '0' })).realizedPnl).toBeNull()
  })

  it('passes through a non-zero closedPnl as-is', () => {
    expect(map(baseFill({ closedPnl: '12.34' })).realizedPnl).toBe('12.34')
  })

  it('preserves startPosition for downstream classification', () => {
    expect(map(baseFill({ startPosition: '0.5' })).startPosition).toBe('0.5')
  })

  it('renders the time epoch (ms) as an ISO timestamp', () => {
    const fill = map(baseFill({ time: 1_700_000_000_000 }))
    expect(fill.createdAt).toBe(new Date(1_700_000_000_000).toISOString())
  })

  it('returns the resolved market verbatim', () => {
    const fill = map(baseFill())
    expect(fill.market).toBe(ETH_MARKET)
  })

  describe('liquidity role from crossed flag', () => {
    it.each([
      [true, LiquidityRole.TAKER],
      [false, LiquidityRole.MAKER],
    ])('maps crossed: %s to liquidity: %s', (crossed, expected) => {
      expect(map(baseFill({ crossed })).liquidity).toBe(expected)
    })
  })

  describe('orderId from oid', () => {
    it('stringifies the numeric oid into Fill.orderId', () => {
      const fill = map(baseFill({ oid: 12345 }))
      expect(fill.orderId).toBe('12345')
      expect(typeof fill.orderId).toBe('string')
    })
  })

  it('builds a Hyperliquid explorerLink when the fill carries a tx hash', () => {
    expect(map(baseFill({ hash: '0xspot' })).explorerLink).toBe(
      'https://app.hyperliquid.xyz/explorer/tx/0xspot'
    )
  })

  it('leaves explorerLink unset when the fill has no tx hash', () => {
    expect(map(baseFill()).explorerLink).toBeUndefined()
  })

  describe('classification', () => {
    it('routes spot fills (@-indexed pair) on the buy side to SPOT_BUY', () => {
      const fill = mapFill(
        baseFill({ coin: '@230', side: 'B' }),
        spotMarket('@230')
      )
      expect(fill.classification).toBe(FillClassification.SPOT_BUY)
    })

    it('preserves closedPnl "0" on SPOT_BUY fills so downstream can render neutral PnL', () => {
      const fill = mapFill(
        baseFill({ coin: '@230', side: 'B', closedPnl: '0' }),
        spotMarket('@230')
      )
      expect(fill.realizedPnl).toBe('0')
    })

    it('routes spot fills on the sell side to SPOT_SELL', () => {
      const fill = mapFill(
        baseFill({ coin: '@230', side: 'A' }),
        spotMarket('@230')
      )
      expect(fill.classification).toBe(FillClassification.SPOT_SELL)
    })

    it('preserves closedPnl "0" on SPOT_SELL fills so downstream can render neutral PnL', () => {
      const fill = mapFill(
        baseFill({ coin: '@230', side: 'A', closedPnl: '0' }),
        spotMarket('@230')
      )
      expect(fill.realizedPnl).toBe('0')
    })

    it('routes canonical-pair spot fills (PURR/USDC) on the buy side to SPOT_BUY', () => {
      const fill = mapFill(
        baseFill({ coin: 'PURR/USDC', side: 'B' }),
        spotMarket('PURR/USDC')
      )
      expect(fill.classification).toBe(FillClassification.SPOT_BUY)
    })

    it('routes canonical-pair spot fills on the sell side to SPOT_SELL', () => {
      const fill = mapFill(
        baseFill({ coin: 'PURR/USDC', side: 'A' }),
        spotMarket('PURR/USDC')
      )
      expect(fill.classification).toBe(FillClassification.SPOT_SELL)
    })

    it('delegates perp fills to classifyFillFromPosition', () => {
      const fill = map(
        baseFill({ coin: 'ETH', side: 'B', sz: '1', startPosition: '0' })
      )
      expect(fill.classification).toBe(FillClassification.OPENED_LONG)
    })
  })
})
