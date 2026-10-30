import type { Fill, MarketDisplay } from '@lifi/perps-types'
import {
  FillClassification,
  LiquidationMethod,
  LiquidityRole,
  OrderSide,
} from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import type { HlUserFill } from '../types/index.js'
import { classifyFillFromPosition, mapFill } from './mapFill.js'

const ADDRESS = '0x1234567890123456789012345678901234567890'

const mapValidFill = (
  row: HlUserFill,
  market: MarketDisplay,
  address: string = ADDRESS
): Fill => {
  const fill = mapFill(row, market, address)
  if (fill === undefined) {
    throw new Error('mapFill skipped a valid row')
  }
  return fill
}

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

const map = (fill: HlUserFill) => mapValidFill(fill, ETH_MARKET)

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

  // A fill row names no originating order type: a maker fill can come from a
  // limit or a triggered limit order, a taker fill from a market or a limit.
  it.each([
    [false, LiquidityRole.MAKER],
    [true, LiquidityRole.TAKER],
  ] as const)('reports no order type on a crossed: %s (%s) fill', (crossed, liquidity) => {
    const fill = map(baseFill({ crossed }))
    expect(fill.liquidity).toBe(liquidity)
    expect(fill).not.toHaveProperty('type')
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
      const fill = mapValidFill(
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

  it('has no separate fill lifecycle status', () => {
    expect(map(baseFill())).not.toHaveProperty('status')
  })

  // `userFills` carries no leverage and no margin fraction, so the mapper never
  // populates the field.
  it('omits the leverage key on every fill', () => {
    expect(Object.keys(map(baseFill()))).not.toContain('leverage')
    expect(
      Object.keys(map(baseFill({ crossed: false, startPosition: '3' })))
    ).not.toContain('leverage')
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
      const fill = mapValidFill(
        baseFill({ coin: '@230', side: 'B' }),
        spotMarket('@230')
      )
      expect(fill.classification).toBe(FillClassification.SPOT_BUY)
    })

    it('preserves closedPnl "0" on SPOT_BUY fills so downstream can render neutral PnL', () => {
      const fill = mapValidFill(
        baseFill({ coin: '@230', side: 'B', closedPnl: '0' }),
        spotMarket('@230')
      )
      expect(fill.realizedPnl).toBe('0')
    })

    it('routes spot fills on the sell side to SPOT_SELL', () => {
      const fill = mapValidFill(
        baseFill({ coin: '@230', side: 'A' }),
        spotMarket('@230')
      )
      expect(fill.classification).toBe(FillClassification.SPOT_SELL)
    })

    it('preserves closedPnl "0" on SPOT_SELL fills so downstream can render neutral PnL', () => {
      const fill = mapValidFill(
        baseFill({ coin: '@230', side: 'A', closedPnl: '0' }),
        spotMarket('@230')
      )
      expect(fill.realizedPnl).toBe('0')
    })

    it('routes canonical-pair spot fills (PURR/USDC) on the buy side to SPOT_BUY', () => {
      const fill = mapValidFill(
        baseFill({ coin: 'PURR/USDC', side: 'B' }),
        spotMarket('PURR/USDC')
      )
      expect(fill.classification).toBe(FillClassification.SPOT_BUY)
    })

    it('routes canonical-pair spot fills on the sell side to SPOT_SELL', () => {
      const fill = mapValidFill(
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

    it('maps a perp fill with a malformed startPosition and classifies it by side', () => {
      const fill = map(baseFill({ startPosition: '10oops', side: 'A' }))
      expect(fill.classification).toBe(FillClassification.SELL)
    })
  })
})

const perpMarket = (id: string): MarketDisplay => ({
  ...ETH_MARKET,
  id,
  baseAsset: { ...ETH_MARKET.baseAsset, id, displaySymbol: id },
})

const MRNA_LIQUIDATED_USER = '0xbf81e01476d5e56f0b16e7ffb52623ba4032c992'
const HMSTR_LIQUIDATED_USER = '0xcb02837caaee310c178501855b63bf7f4f4b1f8b'
const HMSTR_LIQUIDATOR = '0x2e3d94f0562703b25c83308a05046ddaf9a8dd14'
const ENA_LIQUIDATED_USER = '0xec8ad9a79c0a3b23ab6f387325717c4bc3e7d4ca'
const ENA_LIQUIDATOR = '0x5e177e5e39c0f4e421f5865a6d8beed8d921cb70'

// Venue `userFillsByTime` rows. The isolated-only `xyz:MRNA` liquidation order
// had a 148.55 limit and filled at 185.64.
const MRNA_ISOLATED_MARKET_LIQUIDATION: HlUserFill = {
  coin: 'xyz:MRNA',
  px: '185.64',
  sz: '0.5',
  side: 'A',
  time: 1793108252888,
  startPosition: '0.5',
  dir: 'Close Long',
  closedPnl: '-5.265',
  hash: '0xf26389b60feb6f03f3dd04477a28a7020e03009baaee8dd6962c3508ceef48ee',
  oid: 587296189511,
  crossed: true,
  fee: '0.008019',
  tid: 557720431649339,
  liquidation: {
    liquidatedUser: MRNA_LIQUIDATED_USER,
    markPx: '185.71',
    method: 'market',
  },
  feeToken: 'USDC',
}

const HMSTR_ISOLATED_BACKSTOP_LIQUIDATION: HlUserFill = {
  coin: 'HMSTR',
  px: '0.000255',
  sz: '13385820.0',
  side: 'B',
  time: 1787375624383,
  startPosition: '-13385820.0',
  dir: 'Liquidated Isolated Short',
  closedPnl: '-843.30666',
  hash: '0x3995b356b05a726a3b0f0442b43f850203cc003c4b5d913cdd5e5ea96f5e4c54',
  oid: 522778434368,
  crossed: false,
  fee: '0.0',
  tid: 802203254918732,
  liquidation: {
    liquidatedUser: HMSTR_LIQUIDATED_USER,
    markPx: '0.000231',
    method: 'backstop',
  },
  feeToken: 'USDC',
}

const HMSTR_LIQUIDATOR_FILL: HlUserFill = {
  ...HMSTR_ISOLATED_BACKSTOP_LIQUIDATION,
  side: 'A',
  startPosition: '0.0',
  closedPnl: '0.0',
  crossed: true,
}

const ENA_CROSS_BACKSTOP_LIQUIDATION: HlUserFill = {
  coin: 'ENA',
  px: '0.190162',
  sz: '4425.0',
  side: 'A',
  time: 1791981031011,
  startPosition: '4425.0',
  dir: 'Liquidated Cross Long',
  closedPnl: '-87.3495',
  hash: '0x59941b081bb8e1995b0d04468ac819010e0032edb6bc006bfd5cc65adabcbb83',
  oid: 574111277572,
  crossed: false,
  fee: '0.0',
  tid: 841827541118148,
  liquidation: {
    liquidatedUser: ENA_LIQUIDATED_USER,
    markPx: '0.19481',
    method: 'backstop',
  },
  feeToken: 'USDC',
}

const ENA_LIQUIDATOR_FILL: HlUserFill = {
  ...ENA_CROSS_BACKSTOP_LIQUIDATION,
  side: 'B',
  startPosition: '58322.0',
  closedPnl: '0.0',
  crossed: true,
}

describe('mapFill (Hyperliquid) liquidation', () => {
  it.each([
    [
      'an isolated market liquidation',
      MRNA_ISOLATED_MARKET_LIQUIDATION,
      MRNA_LIQUIDATED_USER,
      LiquidationMethod.MARKET,
      '185.71',
      '185.64',
      FillClassification.CLOSED_LONG,
    ],
    [
      'an isolated backstop liquidation',
      HMSTR_ISOLATED_BACKSTOP_LIQUIDATION,
      HMSTR_LIQUIDATED_USER,
      LiquidationMethod.BACKSTOP,
      '0.000231',
      '0.000255',
      FillClassification.CLOSED_SHORT,
    ],
    [
      'a cross backstop liquidation',
      ENA_CROSS_BACKSTOP_LIQUIDATION,
      ENA_LIQUIDATED_USER,
      LiquidationMethod.BACKSTOP,
      '0.19481',
      '0.190162',
      FillClassification.CLOSED_LONG,
    ],
  ] as const)('marks %s on the liquidated account fill', (_label, row, address, method, markPrice, price, classification) => {
    const fill = mapValidFill(row, perpMarket(row.coin), address)
    expect(fill.liquidation).toEqual({ method, markPrice })
    expect(fill.price).toBe(price)
    expect(fill.classification).toBe(classification)
  })

  it('matches a checksummed account address to the venue lowercase address', () => {
    const fill = mapValidFill(
      MRNA_ISOLATED_MARKET_LIQUIDATION,
      perpMarket('xyz:MRNA'),
      '0xbf81E01476d5E56f0b16E7FFb52623Ba4032C992'
    )
    expect(fill.liquidation?.method).toBe(LiquidationMethod.MARKET)
  })

  it('gives no order type to a liquidated maker fill, which no resting limit order made', () => {
    const fill = mapValidFill(
      HMSTR_ISOLATED_BACKSTOP_LIQUIDATION,
      perpMarket('HMSTR'),
      HMSTR_LIQUIDATED_USER
    )
    expect(fill.liquidity).toBe(LiquidityRole.MAKER)
    expect(fill).not.toHaveProperty('type')
  })

  it.each([
    [
      'order-book maker',
      {
        ...MRNA_ISOLATED_MARKET_LIQUIDATION,
        side: 'B',
        startPosition: '0',
        dir: 'Open Long',
        closedPnl: '0.0',
        crossed: false,
      },
      ADDRESS,
    ],
    ['isolated backstop', HMSTR_LIQUIDATOR_FILL, HMSTR_LIQUIDATOR],
    ['cross backstop', ENA_LIQUIDATOR_FILL, ENA_LIQUIDATOR],
  ] as const)('does not mark the %s counterparty fill', (_label, row, address) => {
    const fill = mapValidFill(row, perpMarket(row.coin), address)
    expect(fill).not.toHaveProperty('liquidation')
    expect(fill).not.toHaveProperty('type')
  })

  it('keeps the mark price when the venue reports an unknown method', () => {
    const fill = mapValidFill(
      {
        ...MRNA_ISOLATED_MARKET_LIQUIDATION,
        liquidation: {
          liquidatedUser: MRNA_LIQUIDATED_USER,
          markPx: '185.71',
          method: 'unknown',
        },
      },
      perpMarket('xyz:MRNA'),
      MRNA_LIQUIDATED_USER
    )
    expect(fill.liquidation).toEqual({ markPrice: '185.71' })
  })

  it.each([
    [
      'market close',
      baseFill({
        side: 'A',
        startPosition: '1',
        dir: 'Close Long',
        closedPnl: '12.5',
      }),
    ],
    [
      'TP/SL close',
      baseFill({
        side: 'B',
        startPosition: '-1',
        dir: 'Close Short',
        closedPnl: '-3',
        crossed: false,
      }),
    ],
  ])('maps an ordinary %s without a liquidation marker', (_label, row) => {
    expect(map(row)).not.toHaveProperty('liquidation')
  })
})

describe('mapFill (Hyperliquid) invalid rows', () => {
  it('keeps a fill with a non-decimal sz as the raw venue string', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      mapFill(baseFill({ sz: '10oops' }), ETH_MARKET, ADDRESS)
    ).toMatchObject({
      size: '10oops',
      filledSize: '10oops',
    })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('keeps a fill with a non-decimal px as the raw venue string', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(mapFill(baseFill({ px: '' }), ETH_MARKET, ADDRESS)).toMatchObject({
      price: '',
    })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('skips a fill with an invalid time and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      mapFill(baseFill({ time: Number.NaN }), ETH_MARKET, ADDRESS)
    ).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("skipping fill row on market 'ETH': `time`")
    )
    warn.mockRestore()
  })
})
