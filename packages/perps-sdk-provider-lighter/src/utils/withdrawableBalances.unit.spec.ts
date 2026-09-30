import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import type { LtAccount } from '../types/account.js'
import { LT_ASSET_ID_USDC } from '../types/action.js'
import * as barrel from './index.js'
import {
  lighterWithdrawableBalances,
  transferableWithin,
} from './withdrawableBalances.js'

type WithdrawableAccount = Pick<LtAccount, 'assets' | 'available_balance'>

// Fields captured verbatim from live
// `GET https://mainnet.zklighter.elliot.ai/api/v1/account?by=index&value=<n>`.

/** Account 12: three assets, ETH and USDC on the perps route. */
const MULTI_ASSET_ACCOUNT: WithdrawableAccount = {
  available_balance: '13.891825',
  assets: [
    {
      symbol: 'ETH',
      asset_id: 1,
      balance: '0.00000000',
      locked_balance: '0.00000000',
      margin_mode: 'enabled',
      margin_balance: '0.00709091',
      multiplier: '1.000000000000000000',
    },
    {
      symbol: 'LIT',
      asset_id: 2,
      balance: '8.00004674',
      locked_balance: '0.00000000',
      margin_mode: 'disabled',
      margin_balance: '0.00000000',
      multiplier: '1.000000000000000000',
    },
    {
      symbol: 'USDC',
      asset_id: 3,
      balance: '0.000000',
      locked_balance: '0.000000',
      margin_mode: 'enabled',
      margin_balance: '13.89182545205',
      multiplier: '1.000000000000000000',
    },
  ],
}

/** Account 185: a unified-mode account whose whole spot USDC is locked. */
const LOCKED_ACCOUNT: WithdrawableAccount = {
  available_balance: '16107.856484',
  assets: [
    {
      symbol: 'USDC',
      asset_id: 3,
      balance: '0.000000',
      locked_balance: '5303.615000',
      margin_mode: 'enabled',
      margin_balance: '16107.856484256204',
      multiplier: '1.000000000000000000',
    },
  ],
}

/** Account 7684: open positions hold part of the USDC margin. */
const OPEN_POSITIONS_ACCOUNT: WithdrawableAccount = {
  available_balance: '364310.903135',
  assets: [
    {
      symbol: 'USDC',
      asset_id: 3,
      balance: '103.00085138124',
      locked_balance: '0.000000',
      margin_mode: 'disabled',
      margin_balance: '388482.377119189308',
      multiplier: '1.000000000000000000',
    },
  ],
}

/** Account 69: unrealized profit lifts `available_balance` above the margin. */
const PROFIT_ACCOUNT: WithdrawableAccount = {
  available_balance: '4306.193124',
  assets: [
    {
      symbol: 'LIT',
      asset_id: 2,
      balance: '0.00000056',
      locked_balance: '0.00000000',
      margin_mode: 'disabled',
      margin_balance: '0.00000000',
      multiplier: '1.000000000000000000',
    },
    {
      symbol: 'USDC',
      asset_id: 3,
      balance: '0.000000',
      locked_balance: '0.000000',
      margin_mode: 'enabled',
      margin_balance: '2890.789967953113',
      multiplier: '1.000000000000000000',
    },
  ],
}

/** Account 2000: open positions hold the whole USDC margin. */
const NO_FREE_MARGIN_ACCOUNT: WithdrawableAccount = {
  available_balance: '0.000000',
  assets: [
    {
      symbol: 'USDC',
      asset_id: 3,
      balance: '0.000000',
      locked_balance: '0.000000',
      margin_mode: 'enabled',
      margin_balance: '143.349992980888',
      multiplier: '1.000000000000000000',
    },
  ],
}

const withdrawable = (account: WithdrawableAccount) =>
  lighterWithdrawableBalances(account, LT_ASSET_ID_USDC)

describe('lighterWithdrawableBalances', () => {
  it('splits each held asset into its spot and perps routes', () => {
    expect(withdrawable(MULTI_ASSET_ACCOUNT)).toEqual([
      { assetId: '1', route: 'perps', available: '0.00709091' },
      { assetId: '2', route: 'spot', available: '8.00004674' },
      { assetId: '3', route: 'perps', available: '13.891825' },
    ])
  })

  it('caps the settlement perps route at available_balance when positions hold margin', () => {
    expect(withdrawable(OPEN_POSITIONS_ACCOUNT)).toEqual([
      { assetId: '3', route: 'spot', available: '103.00085138124' },
      { assetId: '3', route: 'perps', available: '364310.903135' },
    ])
  })

  it('caps the settlement perps route at margin_balance when available_balance is larger', () => {
    expect(withdrawable(PROFIT_ACCOUNT)).toEqual([
      { assetId: '2', route: 'spot', available: '0.00000056' },
      { assetId: '3', route: 'perps', available: '2890.789967953113' },
    ])
  })

  it('drops the settlement perps route when available_balance is zero', () => {
    expect(withdrawable(NO_FREE_MARGIN_ACCOUNT)).toEqual([])
  })

  it('drops the settlement perps route when available_balance is negative', () => {
    expect(
      withdrawable({ ...NO_FREE_MARGIN_ACCOUNT, available_balance: '-12.5' })
    ).toEqual([])
  })

  it('keeps margin_balance on a non-settlement perps route', () => {
    expect(
      withdrawable({
        available_balance: NO_FREE_MARGIN_ACCOUNT.available_balance,
        assets: MULTI_ASSET_ACCOUNT.assets,
      })
    ).toEqual([
      { assetId: '1', route: 'perps', available: '0.00709091' },
      { assetId: '2', route: 'spot', available: '8.00004674' },
    ])
  })

  it('caps the asset at the given settlement index, not at USDC', () => {
    expect(
      lighterWithdrawableBalances(
        { ...MULTI_ASSET_ACCOUNT, available_balance: '0.005' },
        1
      )
    ).toEqual([
      { assetId: '1', route: 'perps', available: '0.005' },
      { assetId: '2', route: 'spot', available: '8.00004674' },
      { assetId: '3', route: 'perps', available: '13.89182545205' },
    ])
  })

  it('subtracts locked_balance from the spot route', () => {
    expect(
      withdrawable({
        ...LOCKED_ACCOUNT,
        assets: [{ ...LOCKED_ACCOUNT.assets[0], balance: '6000.000000' }],
      })
    ).toContainEqual({
      assetId: '3',
      route: 'spot',
      available: '696.385',
    })
  })

  it('drops the spot route when locked_balance covers the whole balance', () => {
    expect(withdrawable(LOCKED_ACCOUNT)).toEqual([
      { assetId: '3', route: 'perps', available: '16107.856484' },
    ])
  })

  it('reports the offending field when a balance is not a decimal', () => {
    expect(() =>
      withdrawable({
        ...MULTI_ASSET_ACCOUNT,
        assets: [{ ...MULTI_ASSET_ACCOUNT.assets[0], margin_balance: 'n/a' }],
      })
    ).toThrow('margin_balance')
  })

  it('reports available_balance when it is not a decimal', () => {
    expect(() =>
      withdrawable({ ...MULTI_ASSET_ACCOUNT, available_balance: 'n/a' })
    ).toThrow('available_balance')
  })

  it('ignores available_balance when the account holds no settlement asset', () => {
    expect(
      withdrawable({
        available_balance: 'n/a',
        assets: MULTI_ASSET_ACCOUNT.assets.filter(
          (asset) => asset.asset_id !== LT_ASSET_ID_USDC
        ),
      })
    ).toEqual([
      { assetId: '1', route: 'perps', available: '0.00709091' },
      { assetId: '2', route: 'spot', available: '8.00004674' },
    ])
  })

  it('returns nothing for an account holding no assets', () => {
    expect(withdrawable({ available_balance: '0.000000', assets: [] })).toEqual(
      []
    )
  })

  it('sets no withdrawal fee on any row, since Lighter publishes none', () => {
    const rows = withdrawable(MULTI_ASSET_ACCOUNT)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row).not.toHaveProperty('withdrawalFee')
    }
  })
})

describe('transferableWithin', () => {
  it.each([
    ['venue figure below the units', '5', '8', '5'],
    ['venue figure above the units', '9', '8', '8'],
    ['negative venue figure', '-1', '8', '0'],
  ])('returns the capped amount for a %s', (_, venue, units, expected) => {
    expect(transferableWithin(new Big(venue), new Big(units)).toFixed()).toBe(
      expected
    )
  })
})

describe('utils public barrel', () => {
  it('re-exports lighterWithdrawableBalances', () => {
    expect(barrel.lighterWithdrawableBalances).toBe(lighterWithdrawableBalances)
  })
})
