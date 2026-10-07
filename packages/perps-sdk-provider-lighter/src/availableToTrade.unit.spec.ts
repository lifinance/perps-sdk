import type { Market, PerpsMarketDisplay, Position } from '@lifi/perps-types'
import { PerpsErrorCode, PositionMarginAdjustment } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { lighterAvailableToTrade } from './availableToTrade.js'
import type { LtAccountPosition } from './types/index.js'
import { LT_MARGIN_MODE_CROSS, LT_MARGIN_MODE_ISOLATED } from './types/index.js'
import { mapPosition } from './utils/mapPosition.js'

const USDC = {
  providerId: 'lighter',
  id: 'USDC',
  displaySymbol: 'USDC',
  logoURI: '',
}

const MARKET: Market = {
  providerId: 'lighter',
  id: '1',
  categoryId: 'lighter',
  baseAsset: {
    providerId: 'lighter',
    id: '1',
    displaySymbol: 'BTC',
    logoURI: '',
  },
  quoteAsset: USDC,
  szDecimals: 5,
  maxLeverage: 50,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
}

const displayOf = (market: Market): PerpsMarketDisplay => ({
  providerId: market.providerId,
  id: market.id,
  categoryId: market.categoryId,
  baseAsset: market.baseAsset,
  quoteAsset: market.quoteAsset,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
})

// Lighter `/api/v1/account` position row; IMR = position_value × IMF ÷ 100.
const row = (overrides: Partial<LtAccountPosition>): LtAccountPosition => ({
  market_id: 1,
  symbol: 'BTC',
  initial_margin_fraction: '10.00',
  open_order_count: 0,
  pending_order_count: 0,
  position_tied_order_count: 0,
  sign: 1,
  position: '0.01',
  avg_entry_price: '100000',
  position_value: '1000',
  unrealized_pnl: '0',
  realized_pnl: '0',
  liquidation_price: '0',
  total_funding_paid_out: '0',
  margin_mode: LT_MARGIN_MODE_CROSS,
  allocated_margin: '0.000000',
  total_discount: '0',
  ...overrides,
})

const positionOn = (
  market: Market,
  overrides: Partial<LtAccountPosition>
): Position => {
  const position = mapPosition(
    row({ market_id: Number(market.id), ...overrides }),
    displayOf(market)
  )
  if (position === undefined) {
    throw new Error('expected a mapped position')
  }
  return position
}

describe('lighterAvailableToTrade', () => {
  it('throws an SDKError when the available margin is not a decimal', () => {
    expect(() => lighterAvailableToTrade(MARKET, '42,5', [])).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.SDKError })
    )
  })

  it('gives both sides the available margin without a position', () => {
    expect(lighterAvailableToTrade(MARKET, '42.5', [])).toEqual({
      providerId: 'lighter',
      marketId: '1',
      asset: USDC,
      buy: '42.5',
      sell: '42.5',
    })
  })

  it('ignores a position on another market', () => {
    const other: Market = { ...MARKET, id: '2' }
    const result = lighterAvailableToTrade(MARKET, '42.5', [
      positionOn(other, {
        margin_mode: LT_MARGIN_MODE_ISOLATED,
        allocated_margin: '100',
      }),
    ])
    expect(result).toMatchObject({ buy: '42.5', sell: '42.5' })
  })

  it('worked example: 5 free and an isolated long with 100 allocated', () => {
    const result = lighterAvailableToTrade(MARKET, '5', [
      positionOn(MARKET, {
        margin_mode: LT_MARGIN_MODE_ISOLATED,
        allocated_margin: '100',
        unrealized_pnl: '0',
      }),
    ])
    expect(result).toMatchObject({ buy: '5', sell: '205' })
  })

  it('isolated long: sell adds allocated margin, uPnL and IMR', () => {
    const result = lighterAvailableToTrade(MARKET, '50', [
      positionOn(MARKET, {
        margin_mode: LT_MARGIN_MODE_ISOLATED,
        allocated_margin: '100',
        unrealized_pnl: '-20',
      }),
    ])
    expect(result).toMatchObject({ buy: '50', sell: '230' })
  })

  it('isolated long: equity above IMR releases all of it', () => {
    const result = lighterAvailableToTrade(MARKET, '50', [
      positionOn(MARKET, {
        margin_mode: LT_MARGIN_MODE_ISOLATED,
        allocated_margin: '150',
        unrealized_pnl: '10',
      }),
    ])
    expect(result).toMatchObject({ buy: '50', sell: '310' })
  })

  it('cross short: buy adds the cross IMR twice, sell stays available', () => {
    const result = lighterAvailableToTrade(MARKET, '40', [
      positionOn(MARKET, {
        sign: -1,
        position: '0.02',
        position_value: '2000',
        initial_margin_fraction: '5.00',
        unrealized_pnl: '-30',
      }),
    ])
    expect(result).toMatchObject({ buy: '240', sell: '40' })
  })

  it('isolated short: buy adds allocated margin, uPnL and IMR', () => {
    const result = lighterAvailableToTrade(MARKET, '50', [
      positionOn(MARKET, {
        sign: -1,
        margin_mode: LT_MARGIN_MODE_ISOLATED,
        allocated_margin: '100',
        unrealized_pnl: '-20',
      }),
    ])
    expect(result).toMatchObject({ buy: '230', sell: '50' })
  })

  it('cross long: sell adds the cross IMR twice, buy stays available', () => {
    const result = lighterAvailableToTrade(MARKET, '40', [
      positionOn(MARKET, {
        position: '0.02',
        position_value: '2000',
        initial_margin_fraction: '5.00',
        unrealized_pnl: '30',
      }),
    ])
    expect(result).toMatchObject({ buy: '40', sell: '240' })
  })

  it('releases nothing from an isolated position whose loss exceeds its margin', () => {
    // The −40 equity clamps at 0, so the 3 free and the 10 IMR remain.
    const result = lighterAvailableToTrade(MARKET, '3', [
      positionOn(MARKET, {
        margin_mode: LT_MARGIN_MODE_ISOLATED,
        allocated_margin: '10',
        unrealized_pnl: '-50',
        position_value: '100',
      }),
    ])
    expect(result).toMatchObject({ buy: '3', sell: '13' })
  })

  it('keeps the IMR when a margin deficit exceeds the released margin', () => {
    const result = lighterAvailableToTrade(MARKET, '-150', [
      positionOn(MARKET, {
        position: '0.02',
        position_value: '2000',
        initial_margin_fraction: '5.00',
      }),
    ])
    expect(result).toMatchObject({ buy: '0', sell: '100' })
  })

  it('clamps a negative available margin at 0 on the adding side', () => {
    const result = lighterAvailableToTrade(MARKET, '-10', [
      positionOn(MARKET, {
        margin_mode: LT_MARGIN_MODE_ISOLATED,
        allocated_margin: '100',
      }),
    ])
    expect(result).toMatchObject({ buy: '0', sell: '190' })
  })

  it('keeps exact decimals', () => {
    const result = lighterAvailableToTrade(MARKET, '0.1', [
      positionOn(MARKET, {
        margin_mode: LT_MARGIN_MODE_ISOLATED,
        allocated_margin: '0.2',
        position_value: '2',
      }),
    ])
    expect(result).toMatchObject({ buy: '0.1', sell: '0.5' })
  })
})

// ---------------------------------------------------------------------------
// Recorded venue snapshot: Lighter `GET /api/v1/account?by=index&value=242`
// (unified mode), recorded 2026-09-30T16:30:51Z. The two isolated position
// rows are copied verbatim; ANTHROPIC sits below its IMR, STABLECOINX above.
// `available_balance` read 7928414.373984; the cross free collateral is
// cross_asset_value 9180384.076306004 − cross IMR 1255821.527953.
// ---------------------------------------------------------------------------
describe('lighterAvailableToTrade — account 242 snapshot', () => {
  const CROSS_FREE_COLLATERAL = '7924562.548353004'

  const marketFor = (id: string, symbol: string): Market => ({
    ...MARKET,
    id,
    baseAsset: { ...MARKET.baseAsset, id, displaySymbol: symbol },
  })
  const ANTHROPIC = marketFor('193', 'ANTHROPIC')
  const STABLECOINX = marketFor('229', 'STABLECOINX')

  const POSITIONS = [
    positionOn(ANTHROPIC, {
      symbol: 'ANTHROPIC',
      initial_margin_fraction: '100.00',
      sign: 1,
      position: '477.87709',
      avg_entry_price: '2136.4',
      position_value: '1020172.011732',
      unrealized_pnl: '-759.733703',
      realized_pnl: '0.000000',
      liquidation_price: '1.1006155702280012',
      total_funding_paid_out: '-536.914375',
      margin_mode: LT_MARGIN_MODE_ISOLATED,
      allocated_margin: '1020468.901545',
    }),
    positionOn(STABLECOINX, {
      symbol: 'STABLECOINX',
      initial_margin_fraction: '20.00',
      sign: 1,
      position: '685.05',
      avg_entry_price: '14.3014',
      position_value: '11294.282340',
      unrealized_pnl: '1497.081797',
      realized_pnl: '0.000000',
      liquidation_price: '7.830809215982907',
      total_funding_paid_out: '55.741822',
      margin_mode: LT_MARGIN_MODE_ISOLATED,
      allocated_margin: '5076.444193',
    }),
  ]

  it('below its IMR: buy is the cross free collateral, sell adds IMR 1020172.011732 and equity 1019709.167842', () => {
    expect(
      lighterAvailableToTrade(ANTHROPIC, CROSS_FREE_COLLATERAL, POSITIONS)
    ).toMatchObject({
      buy: CROSS_FREE_COLLATERAL,
      sell: '9964443.727927004',
    })
  })

  it('above its IMR: buy is the cross free collateral, sell adds IMR 2258.856468 and equity 6573.52599', () => {
    expect(
      lighterAvailableToTrade(STABLECOINX, CROSS_FREE_COLLATERAL, POSITIONS)
    ).toMatchObject({
      buy: CROSS_FREE_COLLATERAL,
      sell: '7933394.930811004',
    })
  })
})
