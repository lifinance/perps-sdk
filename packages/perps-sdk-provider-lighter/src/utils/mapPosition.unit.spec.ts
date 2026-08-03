import type { PerpsMarketDisplay } from '@lifi/perps-types'
import {
  MarginMode,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { LtAccountPosition } from '../types/index.js'
import {
  LT_MARGIN_MODE_CROSS,
  LT_MARGIN_MODE_ISOLATED,
} from '../types/index.js'
import { mapPosition } from './mapPosition.js'

const SYMBOL = 'BTC'
const MARKET: PerpsMarketDisplay = {
  providerId: 'lighter',
  id: '1',
  categoryId: 'lighter',
  baseAsset: {
    providerId: 'lighter',
    id: '1',
    displaySymbol: SYMBOL,
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'lighter',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: '',
  },
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
}

const basePosition = (
  overrides: Partial<LtAccountPosition> = {}
): LtAccountPosition => ({
  market_id: 1,
  symbol: SYMBOL,
  initial_margin_fraction: '2.00',
  open_order_count: 0,
  pending_order_count: 0,
  position_tied_order_count: 0,
  sign: 1,
  position: '0.00106',
  avg_entry_price: '79000',
  position_value: '83.961964',
  unrealized_pnl: '0',
  realized_pnl: '0',
  liquidation_price: '0',
  total_funding_paid_out: '0',
  margin_mode: LT_MARGIN_MODE_CROSS,
  allocated_margin: '0.000000',
  total_discount: '0',
  ...overrides,
})

describe('mapPosition (Lighter)', () => {
  describe('marginUsed', () => {
    // Cross-margin: Lighter never pre-allocates margin per position so
    // `allocated_margin` is always "0" on a cross account; derive margin as
    // `position_value × imf / 100` (imf is in percent units). Snapshots below
    // were captured from accounts 5, 24, 80 on mainnet.zklighter.elliot.ai.
    it('derives non-zero marginUsed for a cross-margin position with allocated_margin="0"', () => {
      // Account 5: BTC cross position, size 0.00106, notional 83.961964 USDC,
      // imf 2.00 (50× leverage).
      const result = mapPosition(
        basePosition({
          margin_mode: LT_MARGIN_MODE_CROSS,
          allocated_margin: '0.000000',
          position_value: '83.961964',
          initial_margin_fraction: '2.00',
        }),
        MARKET
      )

      // 83.961964 × 2.00 / 100 = 1.67923928
      expect(parseFloat(result.marginUsed)).toBeCloseTo(1.67923928, 8)
      expect(result.initialMarginRequirement).toBe('1.67923928')
      expect(result.marginMode).toBe(MarginMode.CROSS)
    })

    it('derives marginUsed for a short cross-margin position', () => {
      // Account 24: ETH short cross, size 30, notional 67548.300000 USDC,
      // imf 2.00.
      const result = mapPosition(
        basePosition({
          symbol: 'ETH',
          sign: -1,
          margin_mode: LT_MARGIN_MODE_CROSS,
          allocated_margin: '0.000000',
          position: '30.0000',
          position_value: '67548.300000',
          initial_margin_fraction: '2.00',
        }),
        MARKET
      )

      // 67548.300000 × 2.00 / 100 = 1350.966
      expect(parseFloat(result.marginUsed)).toBeCloseTo(1350.966, 6)
      expect(result.side).toBe(PositionSide.SHORT)
      expect(result.marginMode).toBe(MarginMode.CROSS)
    })

    it('uses allocated_margin verbatim for isolated-margin positions', () => {
      // Account 24: USDJPY isolated long. allocated_margin (1046.077285) ≠
      // position_value × imf / 100 (47.354) because isolated positions can
      // be over-collateralized — the on-chain field is the source of truth.
      const result = mapPosition(
        basePosition({
          symbol: 'USDJPY',
          margin_mode: LT_MARGIN_MODE_ISOLATED,
          allocated_margin: '1046.077285',
          position: '15.000',
          position_value: '2367.705000',
          initial_margin_fraction: '2.00',
        }),
        MARKET
      )

      expect(result.marginUsed).toBe('1046.077285')
      expect(result.initialMarginRequirement).toBe('47.3541')
      expect(result.marginMode).toBe(MarginMode.ISOLATED)
    })

    it('falls back to "0" for a cross position with zero notional (closed/empty)', () => {
      // Closed market slots return position=0 and position_value="-0.000000";
      // the derivation must collapse to "0" without producing NaN or a
      // negative number.
      const result = mapPosition(
        basePosition({
          margin_mode: LT_MARGIN_MODE_CROSS,
          position: '0',
          position_value: '-0.000000',
          allocated_margin: '0.000000',
          initial_margin_fraction: '2.00',
        }),
        MARKET
      )

      expect(parseFloat(result.marginUsed)).toBe(0)
    })
  })

  describe('other invariants', () => {
    it('maps sign>=0 to LONG and sign<0 to SHORT', () => {
      expect(mapPosition(basePosition({ sign: 1 }), MARKET).side).toBe(
        PositionSide.LONG
      )
      expect(mapPosition(basePosition({ sign: -1 }), MARKET).side).toBe(
        PositionSide.SHORT
      )
    })

    it('computes markPrice from position_value / |size|', () => {
      const result = mapPosition(
        basePosition({ position: '0.00106', position_value: '83.961964' }),
        MARKET
      )
      // 83.961964 / 0.00106 ≈ 79209.4
      expect(parseFloat(result.markPrice)).toBeCloseTo(79209.4, 1)
    })

    it('derives fractional leverage from the initial_margin_fraction', () => {
      expect(
        mapPosition(basePosition({ initial_margin_fraction: '2.00' }), MARKET)
          .leverage
      ).toBe(50)
      expect(
        mapPosition(basePosition({ initial_margin_fraction: '12.50' }), MARKET)
          .leverage
      ).toBe(8)
      // Fractional IMFs must not round to whole or two-decimal display
      // leverage. Risk calculations consume the exact IMF separately.
      expect(
        mapPosition(basePosition({ initial_margin_fraction: '45.00' }), MARKET)
          .leverage
      ).toBe(100 / 45)
      expect(
        mapPosition(
          basePosition({
            position_value: '1.000001',
            initial_margin_fraction: '45.00',
          }),
          MARKET
        ).initialMarginRequirement
      ).toBe('0.45000045')
    })

    it.each([
      '0',
      '-1',
      'n/a',
    ])('rejects invalid initial_margin_fraction %s', (initialMarginFraction) => {
      expect(() =>
        mapPosition(
          basePosition({
            initial_margin_fraction: initialMarginFraction,
          }),
          MARKET
        )
      ).toThrowError()
    })
  })
})
