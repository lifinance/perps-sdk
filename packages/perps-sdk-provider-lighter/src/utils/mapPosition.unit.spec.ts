import { decimalStringToNumber } from '@lifi/perps-sdk'
import type { PerpsMarketDisplay } from '@lifi/perps-types'
import {
  MarginMode,
  PositionMarginAdjustment,
  PositionSide,
} from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { LIGHTER_LEVERAGE_PRECISION } from '../constants.js'
import type { LtAccountPosition } from '../types/index.js'
import {
  LT_MARGIN_MODE_CROSS,
  LT_MARGIN_MODE_ISOLATED,
} from '../types/index.js'
import {
  leverageFromImf,
  leverageFromScaledImf,
  mapPosition,
} from './mapPosition.js'

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

const map = (
  ...args: Parameters<typeof mapPosition>
): NonNullable<ReturnType<typeof mapPosition>> => {
  const position = mapPosition(...args)
  if (position === undefined) {
    throw new Error('expected a mapped position')
  }
  return position
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
      const result = map(
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
      const result = map(
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
      const result = map(
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
      const result = map(
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
      expect(map(basePosition({ sign: 1 }), MARKET).side).toBe(
        PositionSide.LONG
      )
      expect(map(basePosition({ sign: -1 }), MARKET).side).toBe(
        PositionSide.SHORT
      )
    })

    it('computes markPrice from position_value / |size|', () => {
      const result = map(
        basePosition({ position: '0.00106', position_value: '83.961964' }),
        MARKET
      )
      // 83.961964 / 0.00106 ≈ 79209.4
      expect(Number(result.markPrice)).toBeCloseTo(79209.4, 1)
    })

    it('derives fractional leverage from the initial_margin_fraction', () => {
      expect(
        map(basePosition({ initial_margin_fraction: '2.00' }), MARKET).leverage
      ).toBe('50')
      expect(
        map(basePosition({ initial_margin_fraction: '12.50' }), MARKET).leverage
      ).toBe('8')
      // Display leverage rounds to the venue leverage precision. Risk
      // calculations consume the exact IMF separately.
      expect(
        map(basePosition({ initial_margin_fraction: '45.00' }), MARKET).leverage
      ).toBe('2.22')
      expect(
        map(basePosition({ initial_margin_fraction: '33.33' }), MARKET).leverage
      ).toBe('3')
      expect(
        map(
          basePosition({
            position_value: '1.000001',
            initial_margin_fraction: '45.00',
          }),
          MARKET
        ).initialMarginRequirement
      ).toBe('0.45000045')
    })

    // `total_funding_paid_out` is already signed from the account's point of
    // view, so it passes through unchanged. Snapshots come from
    // mainnet.zklighter.elliot.ai `/api/v1/account`: index 27927 (BTC long,
    // paid) and a HYPE short row (received).
    it.each([
      ['-50428.248207', 1],
      ['2403.643822', -1],
      ['0', 1],
    ])('passes total_funding_paid_out %s through to accruedFunding', (totalFundingPaidOut, sign) => {
      const result = map(
        basePosition({ sign, total_funding_paid_out: totalFundingPaidOut }),
        MARKET
      )

      expect(result.accruedFunding).toBe(totalFundingPaidOut)
    })

    // Lighter marks `total_funding_paid_out` `omitempty`, so a position that
    // has accrued no funding yet arrives with the key absent.
    it('defaults accruedFunding to "0" when total_funding_paid_out is absent', () => {
      const { total_funding_paid_out, ...withoutFunding } = basePosition()

      expect(map(withoutFunding, MARKET).accruedFunding).toBe('0')
    })

    it.each([
      ['initial_margin_fraction', { initial_margin_fraction: '0' }],
      ['initial_margin_fraction', { initial_margin_fraction: '-1' }],
      ['initial_margin_fraction', { initial_margin_fraction: 'n/a' }],
    ])('keeps the row without leverage and warns once when %s is invalid (%o)', async (field, overrides) => {
      vi.resetModules()
      const { mapPosition: freshMapPosition } = await import('./mapPosition.js')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const position = freshMapPosition(basePosition(overrides), MARKET)
      expect(position).toMatchObject({ size: '0.00106', marginUsed: '0' })
      expect(position).not.toHaveProperty('leverage')
      expect(position).not.toHaveProperty('initialMarginRequirement')
      freshMapPosition(basePosition(overrides), MARKET)
      expect(warn).toHaveBeenCalledOnce()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          `[lighter] position \`${field}\` is not readable`
        )
      )
      warn.mockRestore()
    })

    it('keeps the isolated margin when the initial margin fraction is invalid', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(
        map(
          basePosition({
            margin_mode: LT_MARGIN_MODE_ISOLATED,
            allocated_margin: '12.5',
            initial_margin_fraction: 'n/a',
          }),
          MARKET
        )
      ).toMatchObject({ marginUsed: '12.5' })
      vi.restoreAllMocks()
    })

    it('keeps the row without markPrice or initialMarginRequirement when position_value is invalid', async () => {
      vi.resetModules()
      const { mapPosition: freshMapPosition } = await import('./mapPosition.js')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const position = freshMapPosition(
        basePosition({ position_value: '' }),
        MARKET
      )
      expect(position).toMatchObject({ leverage: '50', marginUsed: '0' })
      expect(position).not.toHaveProperty('markPrice')
      expect(position).not.toHaveProperty('initialMarginRequirement')
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '[lighter] position `position_value` is not readable'
        )
      )
      warn.mockRestore()
    })

    it.each([
      ['position', { position: 'abc' }],
    ])('skips the row and warns when %s is invalid (%o)', async (field, overrides) => {
      vi.resetModules()
      const { mapPosition: freshMapPosition } = await import('./mapPosition.js')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      expect(freshMapPosition(basePosition(overrides), MARKET)).toBeUndefined()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          `[lighter] skipping position row on market '1': \`${field}\``
        )
      )
      warn.mockRestore()
    })

    it.each([
      ['entryPrice', { avg_entry_price: 'x' }, 'x'],
      ['liquidationPrice', { liquidation_price: 'NaN' }, 'NaN'],
      ['unrealizedPnl', { unrealized_pnl: '1,000' }, '1,000'],
      ['accruedFunding', { total_funding_paid_out: '?' }, '?'],
      [
        'marginUsed',
        { margin_mode: LT_MARGIN_MODE_ISOLATED, allocated_margin: 'none' },
        'none',
      ],
    ] satisfies [
      keyof ReturnType<typeof map>,
      Partial<LtAccountPosition>,
      string,
    ][])('keeps the row and shows the venue string in %s (%o)', (key, overrides, venueValue) => {
      expect(map(basePosition(overrides), MARKET)[key]).toBe(venueValue)
    })
  })

  // Lighter marks `total_funding_paid_out` and `total_discount` `omitempty` on
  // the Position object, so a row carrying the zero value drops the key.
  // `mapPosition` reads only `total_funding_paid_out`; `total_discount`
  // projects to no `Position` member, so it needs no default.
  describe('omitted omitempty wire fields', () => {
    // Every `Position` member the contract types `string`.
    const REQUIRED_STRINGS = [
      'size',
      'entryPrice',
      'markPrice',
      'liquidationPrice',
      'unrealizedPnl',
      'accruedFunding',
      'marginUsed',
      'initialMarginRequirement',
    ] as const

    it('emits no undefined when total_funding_paid_out is absent', () => {
      const { total_funding_paid_out, ...withoutFunding } = basePosition()

      const result = map(withoutFunding, MARKET)

      for (const field of REQUIRED_STRINGS) {
        expect(typeof result[field]).toBe('string')
      }
    })
  })
})

describe('leverageFromScaledImf', () => {
  it('reads a basis-point IMF as display leverage', () => {
    expect(leverageFromScaledImf(500)).toBe('20')
    expect(leverageFromScaledImf(200)).toBe('50')
    expect(leverageFromScaledImf(666)).toBe('15.02')
    expect(leverageFromScaledImf(3333)).toBe('3')
  })

  it('is undefined for a non-positive IMF', () => {
    expect(leverageFromScaledImf(0)).toBeUndefined()
    expect(leverageFromScaledImf(-500)).toBeUndefined()
  })

  it('is undefined for an unparsable IMF', () => {
    expect(leverageFromScaledImf(Number.NaN)).toBeUndefined()
  })
})

const venueImfFromLeverage = (leverage: number): number =>
  Math.round(10_000 / leverage)

describe('leverageFromImf', () => {
  it.each([
    ['33.33', '3'],
    ['16.67', '6'],
    ['14.29', '7'],
    ['11.11', '9'],
    ['40.00', '2.5'],
  ])('reads IMF %s back as %s', (imf, leverage) => {
    expect(leverageFromImf(imf)).toBe(leverage)
  })

  it('rounds half up at the third decimal place', () => {
    expect(leverageFromImf('8')).toBe('12.5')
    expect(leverageFromImf('16')).toBe('6.25')
    expect(leverageFromImf('32')).toBe('3.13')
  })

  it('reads every leverage at the precision back to a value that re-saves the same IMF', () => {
    const steps = 10 ** LIGHTER_LEVERAGE_PRECISION
    for (let step = steps; step <= 100 * steps; step++) {
      const fraction = venueImfFromLeverage(step / steps)
      const readBack = leverageFromScaledImf(fraction)
      if (readBack === undefined) {
        expect.unreachable(`IMF ${fraction} has no read-back`)
      }
      expect(venueImfFromLeverage(decimalStringToNumber(readBack))).toBe(
        fraction
      )
    }
  })
})
