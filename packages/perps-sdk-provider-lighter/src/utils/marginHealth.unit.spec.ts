import { describe, expect, it } from 'vitest'
import { LIGHTER_ASSET_DETAILS_RESPONSE } from '../../test/assetDetails.js'
import type {
  LtAccount,
  LtAccountAsset,
  LtAccountPosition,
} from '../types/index.js'
import {
  LT_ACCOUNT_TRADING_MODE_SIMPLE,
  LT_ACCOUNT_TRADING_MODE_UNIFIED,
  LT_MARGIN_MODE_CROSS,
  LT_MARGIN_MODE_ISOLATED,
} from '../types/index.js'
import { calculateMarginHealth } from './marginHealth.js'

const USDC = 3
const ETH = 1
const ASSET_DETAILS = LIGHTER_ASSET_DETAILS_RESPONSE.asset_details

const asset = (
  asset_id: number,
  symbol: string,
  margin_balance: string,
  overrides: Partial<LtAccountAsset> = {}
): LtAccountAsset => ({
  symbol,
  asset_id,
  balance: '0',
  locked_balance: '0',
  margin_balance,
  multiplier: '1',
  margin_mode: 'disabled',
  ...overrides,
})

const position = (
  market_id: number,
  unrealized_pnl: string,
  margin_mode = LT_MARGIN_MODE_CROSS
): LtAccountPosition => ({
  market_id,
  initial_margin_fraction: '10.00',
  open_order_count: 0,
  pending_order_count: 0,
  position_tied_order_count: 0,
  sign: 1,
  position: '1',
  avg_entry_price: '100',
  position_value: '100',
  unrealized_pnl,
  realized_pnl: '0',
  liquidation_price: '0',
  margin_mode,
  allocated_margin: margin_mode === LT_MARGIN_MODE_CROSS ? '0' : '20',
})

const account = (overrides: Partial<LtAccount> = {}): LtAccount => ({
  code: 0,
  account_type: 0,
  index: 7684,
  l1_address: '0xDbab51f11B3c5CE383776e6AE6B121E527aCD9Af',
  cancel_all_time: 0,
  total_order_count: 0,
  total_isolated_order_count: 0,
  pending_order_count: 0,
  available_balance: '0',
  status: 1,
  collateral: '1000',
  transaction_time: 0,
  account_trading_mode: LT_ACCOUNT_TRADING_MODE_SIMPLE,
  account_index: 7684,
  name: '',
  description: '',
  positions: [position(0, '-50'), position(1, '-30', LT_MARGIN_MODE_ISOLATED)],
  assets: [asset(USDC, 'USDC', '1000', { balance: '500' })],
  total_asset_value: '940',
  cross_asset_value: '950',
  cross_initial_margin_requirement: '400',
  cross_maintenance_margin_requirement: '190',
  ...overrides,
})

describe('calculateMarginHealth', () => {
  it('divides the venue maintenance margin by cross liquidation value, without spot or isolated amounts', () => {
    expect(calculateMarginHealth(account(), ASSET_DETAILS, USDC)).toEqual({
      ratio: '0.2',
      liquidationThreshold: '1',
    })
  })

  it('uses the maintenance margin requirement, not the initial one', () => {
    expect(
      calculateMarginHealth(
        account({ cross_initial_margin_requirement: '950' }),
        ASSET_DETAILS,
        USDC
      )?.ratio
    ).toBe('0.2')
  })

  it('reads only the figures of the given subaccount', () => {
    const sub = account({
      index: 281474976710600,
      account_type: 1,
      cross_maintenance_margin_requirement: '95',
    })

    expect(calculateMarginHealth(sub, ASSET_DETAILS, USDC)?.ratio).toBe('0.1')
  })

  it('weights unified margin assets by index price and liquidation threshold', () => {
    // Account 5 snapshot (2026-11-23): the same sum gives its venue
    // `cross_asset_value` at that ETH index price.
    const unified = account({
      index: 5,
      account_trading_mode: LT_ACCOUNT_TRADING_MODE_UNIFIED,
      assets: [
        asset(ETH, 'ETH', '0.00020000', { margin_mode: 'enabled' }),
        asset(USDC, 'USDC', '2.441700425745', { margin_mode: 'enabled' }),
      ],
      positions: [position(0, '-1.383289')],
      cross_maintenance_margin_requirement: '0.403158',
    })

    expect(calculateMarginHealth(unified, ASSET_DETAILS, USDC)?.ratio).toBe(
      '0.2946736631505017062445409501430297194743'
    )
  })

  it('gives a ratio equal to the threshold when the liquidation value equals the maintenance margin', () => {
    expect(
      calculateMarginHealth(
        account({ cross_maintenance_margin_requirement: '950' }),
        ASSET_DETAILS,
        USDC
      )?.ratio
    ).toBe('1')
  })

  it('gives a zero ratio without a maintenance margin requirement', () => {
    expect(
      calculateMarginHealth(
        account({ cross_maintenance_margin_requirement: '0.000000' }),
        ASSET_DETAILS,
        USDC
      )
    ).toEqual({ ratio: '0', liquidationThreshold: '1' })
  })

  it('gives no health when cross losses consume the collateral', () => {
    for (const pnl of ['-1000', '-1000.005', '-1500']) {
      expect(
        calculateMarginHealth(
          account({ positions: [position(0, pnl)] }),
          ASSET_DETAILS,
          USDC
        )
      ).toBeUndefined()
    }
  })

  it('ignores a zero margin row that has no asset detail', () => {
    expect(
      calculateMarginHealth(
        account({
          assets: [
            asset(USDC, 'USDC', '1000'),
            asset(99, 'LIT', '0.00000000', { balance: '460' }),
          ],
        }),
        ASSET_DETAILS,
        USDC
      )?.ratio
    ).toBe('0.2')
  })

  it.each([
    [
      'a margin asset without an asset detail',
      account({
        account_trading_mode: LT_ACCOUNT_TRADING_MODE_UNIFIED,
        assets: [
          asset(USDC, 'USDC', '1000'),
          asset(99, 'XAUT', '2', { margin_mode: 'enabled' }),
        ],
      }),
    ],
    [
      'a non-settlement margin balance that the account has not enabled',
      account({
        account_trading_mode: LT_ACCOUNT_TRADING_MODE_UNIFIED,
        assets: [asset(USDC, 'USDC', '1000'), asset(ETH, 'ETH', '456')],
      }),
    ],
  ])('gives no health for %s', (_, input) => {
    expect(calculateMarginHealth(input, ASSET_DETAILS, USDC)).toBeUndefined()
  })
})
