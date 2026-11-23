import { AccountMode, CrossMarginHealthStatus } from '@lifi/perps-types'
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
import { buildLighterCrossMarginHealth } from './crossMarginHealth.js'

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

describe('buildLighterCrossMarginHealth', () => {
  it('divides the venue maintenance margin by cross liquidation equity, without spot or isolated amounts', () => {
    expect(
      buildLighterCrossMarginHealth(account(), ASSET_DETAILS, USDC)
    ).toEqual({
      mode: AccountMode.SIMPLE,
      pool: { type: 'account', accountId: '7684' },
      liquidationThreshold: '1',
      status: CrossMarginHealthStatus.MEASURED,
      ratio: '0.2',
    })
  })

  it('uses the maintenance margin requirement, not the initial one', () => {
    expect(
      buildLighterCrossMarginHealth(
        account({ cross_initial_margin_requirement: '950' }),
        ASSET_DETAILS,
        USDC
      )
    ).toMatchObject({ ratio: '0.2' })
  })

  it('identifies each subaccount by its own index and reads only its own figures', () => {
    const main = buildLighterCrossMarginHealth(account(), ASSET_DETAILS, USDC)
    const sub = buildLighterCrossMarginHealth(
      account({
        index: 281474976710600,
        account_type: 1,
        cross_maintenance_margin_requirement: '95',
      }),
      ASSET_DETAILS,
      USDC
    )

    expect(main).toMatchObject({
      pool: { type: 'account', accountId: '7684' },
      ratio: '0.2',
    })
    expect(sub).toMatchObject({
      pool: { type: 'account', accountId: '281474976710600' },
      ratio: '0.1',
    })
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

    expect(buildLighterCrossMarginHealth(unified, ASSET_DETAILS, USDC)).toEqual(
      {
        mode: AccountMode.UNIFIED,
        pool: { type: 'account', accountId: '5' },
        liquidationThreshold: '1',
        status: CrossMarginHealthStatus.MEASURED,
        ratio: '0.2946736631505017062445409501430297194743',
      }
    )
  })

  it('gives a ratio equal to the threshold when liquidation equity equals the maintenance margin', () => {
    expect(
      buildLighterCrossMarginHealth(
        account({ cross_maintenance_margin_requirement: '950' }),
        ASSET_DETAILS,
        USDC
      )
    ).toMatchObject({ status: CrossMarginHealthStatus.MEASURED, ratio: '1' })
  })

  it('reports no exposure without a maintenance margin requirement', () => {
    expect(
      buildLighterCrossMarginHealth(
        account({ cross_maintenance_margin_requirement: '0.000000' }),
        ASSET_DETAILS,
        USDC
      )
    ).toMatchObject({ status: CrossMarginHealthStatus.NO_EXPOSURE })
  })

  it('reports non-positive equity when cross losses consume the collateral', () => {
    for (const pnl of ['-1000', '-1000.005', '-1500']) {
      expect(
        buildLighterCrossMarginHealth(
          account({ positions: [position(0, pnl)] }),
          ASSET_DETAILS,
          USDC
        )
      ).toMatchObject({ status: CrossMarginHealthStatus.NON_POSITIVE_EQUITY })
    }
  })

  it('ignores a zero margin row that has no asset detail', () => {
    expect(
      buildLighterCrossMarginHealth(
        account({
          assets: [
            asset(USDC, 'USDC', '1000'),
            asset(99, 'LIT', '0.00000000', { balance: '460' }),
          ],
        }),
        ASSET_DETAILS,
        USDC
      )
    ).toMatchObject({ ratio: '0.2' })
  })

  it.each([
    ['no asset details', account(), undefined],
    [
      'a margin asset without an asset detail',
      account({
        account_trading_mode: LT_ACCOUNT_TRADING_MODE_UNIFIED,
        assets: [
          asset(USDC, 'USDC', '1000'),
          asset(99, 'XAUT', '2', { margin_mode: 'enabled' }),
        ],
      }),
      ASSET_DETAILS,
    ],
    [
      'a non-settlement margin balance that the account has not enabled',
      account({
        account_trading_mode: LT_ACCOUNT_TRADING_MODE_UNIFIED,
        assets: [asset(USDC, 'USDC', '1000'), asset(ETH, 'ETH', '456')],
      }),
      ASSET_DETAILS,
    ],
    [
      'a malformed index price',
      account(),
      [{ ...ASSET_DETAILS[1], index_price: 'n/a' }],
    ],
    [
      'a malformed cross unrealized PnL',
      account({ positions: [position(0, '')] }),
      ASSET_DETAILS,
    ],
  ])('reports unavailable for %s', (_, input, details) => {
    expect(buildLighterCrossMarginHealth(input, details, USDC)).toMatchObject({
      status: CrossMarginHealthStatus.UNAVAILABLE,
      liquidationThreshold: '1',
    })
  })
})
