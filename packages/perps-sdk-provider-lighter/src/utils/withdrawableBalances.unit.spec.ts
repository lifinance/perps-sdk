import { describe, expect, it } from 'vitest'
import type { LtAccountAsset } from '../types/account.js'
import * as barrel from './index.js'
import { lighterWithdrawableBalances } from './withdrawableBalances.js'

// Asset rows captured verbatim from live
// `GET https://mainnet.zklighter.elliot.ai/api/v1/account?by=index&value=<n>`.

/** Account 12: three held assets, USDC funded on both routes. */
const MULTI_ASSET_ROWS: LtAccountAsset[] = [
  {
    symbol: 'ETH',
    asset_id: 1,
    balance: '0.00609091',
    locked_balance: '0.00000000',
    margin_mode: 'disabled',
    margin_balance: '0.00000000',
    multiplier: '1.000000000000000000',
  },
  {
    symbol: 'LIT',
    asset_id: 2,
    balance: '6.00005017',
    locked_balance: '0.00000000',
    margin_mode: 'disabled',
    margin_balance: '0.00000000',
    multiplier: '1.000000000000000000',
  },
  {
    symbol: 'USDC',
    asset_id: 3,
    balance: '10.988600',
    locked_balance: '0.000000',
    margin_mode: 'disabled',
    margin_balance: '11.009697536',
    multiplier: '1.000000000000000000',
  },
]

/** Account 185: a unified-mode account whose whole spot balance is locked. */
const LOCKED_ROWS: LtAccountAsset[] = [
  {
    symbol: 'USDC',
    asset_id: 3,
    balance: '0.000000',
    locked_balance: '1500.015000',
    margin_mode: 'enabled',
    margin_balance: '18528.739303256204',
    multiplier: '1.000000000000000000',
  },
]

describe('lighterWithdrawableBalances', () => {
  it('splits each held asset into its spot and perps routes', () => {
    expect(lighterWithdrawableBalances(MULTI_ASSET_ROWS)).toEqual([
      { assetId: '1', route: 'spot', available: '0.00609091' },
      { assetId: '2', route: 'spot', available: '6.00005017' },
      { assetId: '3', route: 'spot', available: '10.9886' },
      { assetId: '3', route: 'perps', available: '11.009697536' },
    ])
  })

  it('drops routes with a zero balance', () => {
    const perpsRows = lighterWithdrawableBalances(MULTI_ASSET_ROWS).filter(
      (row) => row.route === 'perps'
    )
    expect(perpsRows).toEqual([
      { assetId: '3', route: 'perps', available: '11.009697536' },
    ])
  })

  it('subtracts locked_balance from the spot route', () => {
    expect(
      lighterWithdrawableBalances([
        { ...LOCKED_ROWS[0], balance: '2000.000000' },
      ])
    ).toContainEqual({
      assetId: '3',
      route: 'spot',
      available: '499.985',
    })
  })

  it('drops the spot route when locked_balance covers the whole balance', () => {
    expect(lighterWithdrawableBalances(LOCKED_ROWS)).toEqual([
      { assetId: '3', route: 'perps', available: '18528.739303256204' },
    ])
  })

  it('reports the offending field when a balance is not a decimal', () => {
    expect(() =>
      lighterWithdrawableBalances([
        { ...MULTI_ASSET_ROWS[0], margin_balance: 'n/a' },
      ])
    ).toThrow('margin_balance')
  })

  it('returns nothing for an account holding no assets', () => {
    expect(lighterWithdrawableBalances([])).toEqual([])
  })
})

describe('utils public barrel', () => {
  it('re-exports lighterWithdrawableBalances', () => {
    expect(barrel.lighterWithdrawableBalances).toBe(lighterWithdrawableBalances)
  })
})
