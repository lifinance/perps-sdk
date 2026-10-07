import { describe, expect, it } from 'vitest'
import {
  HlAbstractionMode,
  type HlClearinghouseState,
  type HlSpotBalance,
  type HlSpotClearinghouseState,
} from '../types/account.js'
import { hyperliquidWithdrawableBalances } from './withdrawableBalances.js'

const spotBalance = (
  coin: string,
  token: number,
  total: string,
  hold: string
): HlSpotBalance => ({ coin, token, total, hold, entryNtl: '0' })

const spotState = (balances: HlSpotBalance[]): HlSpotClearinghouseState => ({
  balances,
  tokenToAvailableAfterMaintenance: [],
})

const perpsState = (withdrawable: string): HlClearinghouseState =>
  ({ withdrawable }) as HlClearinghouseState

describe('hyperliquidWithdrawableBalances', () => {
  it('omits a spot row when hold equals total', () => {
    const rows = hyperliquidWithdrawableBalances(
      HlAbstractionMode.UNIFIED_ACCOUNT,
      perpsState('0'),
      spotState([spotBalance('USDC', 0, '10.5', '10.5')]),
      '0'
    )
    expect(rows).toEqual([])
  })

  it('omits a spot row when hold exceeds total', () => {
    const rows = hyperliquidWithdrawableBalances(
      HlAbstractionMode.UNIFIED_ACCOUNT,
      perpsState('0'),
      spotState([spotBalance('USDC', 0, '10.5', '11')]),
      '0'
    )
    expect(rows).toEqual([])
  })

  it('skips an outcome-market spot token', () => {
    const rows = hyperliquidWithdrawableBalances(
      HlAbstractionMode.PORTFOLIO_MARGIN,
      perpsState('0'),
      spotState([
        spotBalance('#42', 100_000_042, '500', '0'),
        spotBalance('USDC', 0, '10', '4'),
      ]),
      '0'
    )
    expect(rows).toEqual([
      { assetId: '0', categoryId: 'spot', available: '6', max: '6' },
    ])
  })

  it('omits every spot row on a standard account', () => {
    const rows = hyperliquidWithdrawableBalances(
      HlAbstractionMode.DEFAULT,
      perpsState('2.5'),
      spotState([spotBalance('USDC', 0, '10', '0')]),
      '0'
    )
    expect(rows).toEqual([
      { assetId: '0', categoryId: 'hyperliquid', available: '2.5', max: '2.5' },
    ])
  })

  it('sets the deducted fee on every quote-asset row and on no other asset', () => {
    const rows = hyperliquidWithdrawableBalances(
      HlAbstractionMode.UNIFIED_ACCOUNT,
      perpsState('2.5'),
      spotState([
        spotBalance('USDC', 0, '10', '4'),
        spotBalance('HYPE', 150, '3', '0'),
      ]),
      '0',
      '1'
    )
    expect(rows).toEqual([
      {
        assetId: '0',
        categoryId: 'spot',
        available: '6',
        max: '6',
        withdrawalFee: '1',
        isFeeDeducted: true,
      },
      { assetId: '150', categoryId: 'spot', available: '3', max: '3' },
      {
        assetId: '0',
        categoryId: 'hyperliquid',
        available: '2.5',
        max: '2.5',
        withdrawalFee: '1',
        isFeeDeducted: true,
      },
    ])
    expect(rows[1]).not.toHaveProperty('withdrawalFee')
    expect(rows[1]).not.toHaveProperty('isFeeDeducted')
  })

  it('sets no fee key on any row when the fee is undefined', () => {
    const rows = hyperliquidWithdrawableBalances(
      HlAbstractionMode.UNIFIED_ACCOUNT,
      perpsState('2.5'),
      spotState([spotBalance('USDC', 0, '10', '4')]),
      '0'
    )
    for (const row of rows) {
      expect(row).not.toHaveProperty('withdrawalFee')
      expect(row).not.toHaveProperty('isFeeDeducted')
    }
  })

  it('normalises the fee to a plain decimal', () => {
    const rows = hyperliquidWithdrawableBalances(
      HlAbstractionMode.DEFAULT,
      perpsState('2.5'),
      spotState([]),
      '0',
      '1e-7'
    )
    expect(rows).toEqual([
      {
        assetId: '0',
        categoryId: 'hyperliquid',
        available: '2.5',
        max: '2.5',
        withdrawalFee: '0.0000001',
        isFeeDeducted: true,
      },
    ])
  })

  it('rejects a fee that is not a decimal', () => {
    expect(() =>
      hyperliquidWithdrawableBalances(
        HlAbstractionMode.DEFAULT,
        perpsState('2.5'),
        spotState([]),
        '0',
        'abc'
      )
    ).toThrowError(
      "Hyperliquid field `providers.withdrawalFeeUsd` is not a valid decimal: 'abc'"
    )
  })
})
