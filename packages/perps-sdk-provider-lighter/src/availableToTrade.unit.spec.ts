import type { Market, PerpsMarketDisplay } from '@lifi/perps-types'
import { PositionMarginAdjustment } from '@lifi/perps-types'
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

const positionOn = (market: Market, overrides: Partial<LtAccountPosition>) =>
  mapPosition(
    row({ market_id: Number(market.id), ...overrides }),
    displayOf(market)
  )

describe('lighterAvailableToTrade', () => {
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
    // equity 100 − 20 = 80 sits below the IMR of 100, so none of it is in
    // `available_balance` and closing releases all of it.
    const result = lighterAvailableToTrade(MARKET, '50', [
      positionOn(MARKET, {
        margin_mode: LT_MARGIN_MODE_ISOLATED,
        allocated_margin: '100',
        unrealized_pnl: '-20',
      }),
    ])
    expect(result).toMatchObject({ buy: '50', sell: '230' })
  })

  it('isolated long: equity above IMR releases only the IMR', () => {
    // `available_balance` already counts the 160 − 100 = 60 excess.
    const result = lighterAvailableToTrade(MARKET, '50', [
      positionOn(MARKET, {
        margin_mode: LT_MARGIN_MODE_ISOLATED,
        allocated_margin: '150',
        unrealized_pnl: '10',
      }),
    ])
    expect(result).toMatchObject({ buy: '50', sell: '250' })
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

  it('clamps a losing isolated position whose loss exceeds its margin at 0', () => {
    const result = lighterAvailableToTrade(MARKET, '3', [
      positionOn(MARKET, {
        margin_mode: LT_MARGIN_MODE_ISOLATED,
        allocated_margin: '10',
        unrealized_pnl: '-50',
        position_value: '100',
      }),
    ])
    expect(result).toMatchObject({ buy: '3', sell: '0' })
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
