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
    expect(rows).toEqual([{ assetId: '0', route: 'spot', available: '6' }])
  })

  it('omits every spot row on a standard account', () => {
    const rows = hyperliquidWithdrawableBalances(
      HlAbstractionMode.DEFAULT,
      perpsState('2.5'),
      spotState([spotBalance('USDC', 0, '10', '0')]),
      '0'
    )
    expect(rows).toEqual([{ assetId: '0', route: 'perps', available: '2.5' }])
  })
})
