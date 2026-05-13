import { describe, expect, it } from 'vitest'

import { MarginMode, PositionSide } from '../../../enums.js'
import type { LtAccountPosition } from '../apiTypes.js'
import { LT_MARGIN_MODE_CROSS, LT_MARGIN_MODE_ISOLATED } from '../types.js'
import { mapPosition } from './position.js'

const SYMBOL = 'BTC'

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
    // -------------------------------------------------------------------------
    // Cross-margin: Lighter never pre-allocates margin per position on a cross
    // account, so `/api/v1/account` returns `allocated_margin: "0"`. Derive
    // margin from `position_value × initial_margin_fraction / 100`, the same
    // formula Lighter's own UI uses (verified against accounts 5, 24, 80 on
    // mainnet.zklighter.elliot.ai). IMF is reported in percent units, so
    // e.g. imf=2.00 ⇒ 2% maintenance ⇒ 50× leverage.
    // -------------------------------------------------------------------------
    it('derives non-zero marginUsed for a cross-margin position with allocated_margin="0"', () => {
      // Real /api/v1/account snapshot from account 5: BTC cross position,
      // size 0.00106, notional 83.961964 USDC, imf 2.00 (50× leverage).
      const result = mapPosition(
        basePosition({
          margin_mode: LT_MARGIN_MODE_CROSS,
          allocated_margin: '0.000000',
          position_value: '83.961964',
          initial_margin_fraction: '2.00',
        }),
        SYMBOL
      )

      // 83.961964 × 2.00 / 100 = 1.67923928
      expect(parseFloat(result.marginUsed)).toBeCloseTo(1.67923928, 8)
      expect(result.marginMode).toBe(MarginMode.CROSS)
    })

    it('derives marginUsed for a short cross-margin position', () => {
      // Real snapshot from account 24: ETH short cross position,
      // size 30, notional 67548.300000 USDC, imf 2.00.
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
        'ETH'
      )

      // 67548.300000 × 2.00 / 100 = 1350.966
      expect(parseFloat(result.marginUsed)).toBeCloseTo(1350.966, 6)
      expect(result.side).toBe(PositionSide.SHORT)
      expect(result.marginMode).toBe(MarginMode.CROSS)
    })

    it('uses allocated_margin verbatim for isolated-margin positions', () => {
      // Real snapshot from account 24: USDJPY isolated long. Note alloc_margin
      // (1046.077285) is NOT equal to position_value × imf / 100 (47.354) —
      // isolated positions can be over-collateralized, so the on-chain
      // `allocated_margin` is the source of truth, not a derivation.
      const result = mapPosition(
        basePosition({
          symbol: 'USDJPY',
          margin_mode: LT_MARGIN_MODE_ISOLATED,
          allocated_margin: '1046.077285',
          position: '15.000',
          position_value: '2367.705000',
          initial_margin_fraction: '2.00',
        }),
        'USDJPY'
      )

      expect(result.marginUsed).toBe('1046.077285')
      expect(result.marginMode).toBe(MarginMode.ISOLATED)
    })

    it('falls back to "0" for a cross position with zero notional (closed/empty)', () => {
      // Lighter's API returns a row per market regardless of whether the user
      // has an open position; closed slots have position=0 and
      // position_value="-0.000000". The derivation must collapse to "0"
      // without producing NaN or a negative number.
      const result = mapPosition(
        basePosition({
          margin_mode: LT_MARGIN_MODE_CROSS,
          position: '0',
          position_value: '-0.000000',
          allocated_margin: '0.000000',
          initial_margin_fraction: '2.00',
        }),
        SYMBOL
      )

      expect(parseFloat(result.marginUsed)).toBe(0)
    })
  })

  describe('other invariants (regression guards)', () => {
    it('maps sign>=0 to LONG and sign<0 to SHORT', () => {
      expect(mapPosition(basePosition({ sign: 1 }), SYMBOL).side).toBe(
        PositionSide.LONG
      )
      expect(mapPosition(basePosition({ sign: -1 }), SYMBOL).side).toBe(
        PositionSide.SHORT
      )
    })

    it('computes markPrice from position_value / |size|', () => {
      const result = mapPosition(
        basePosition({ position: '0.00106', position_value: '83.961964' }),
        SYMBOL
      )
      // 83.961964 / 0.00106 ≈ 79209.4
      expect(parseFloat(result.markPrice)).toBeCloseTo(79209.4, 1)
    })

    it('derives leverage as round(100 / initial_margin_fraction)', () => {
      expect(
        mapPosition(basePosition({ initial_margin_fraction: '2.00' }), SYMBOL)
          .leverage
      ).toBe(50)
      expect(
        mapPosition(basePosition({ initial_margin_fraction: '12.50' }), SYMBOL)
          .leverage
      ).toBe(8)
    })
  })
})
