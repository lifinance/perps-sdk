import { describe, expect, it } from 'vitest'
import type { OndoBalanceSummary } from '../types/wire.js'
import { ondoWithdrawableBalances } from './withdrawableBalances.js'

const balance = (withdrawableMargin: string) =>
  ({ withdrawableMargin }) as OndoBalanceSummary

describe('ondoWithdrawableBalances', () => {
  it('sets the account fee on the row in collateral units, added on top', () => {
    expect(ondoWithdrawableBalances('usdc', balance('599'), '1.50')).toEqual([
      {
        assetId: 'usdc',
        route: 'perps',
        available: '599',
        withdrawalFee: '1.5',
        isFeeDeducted: false,
      },
    ])
  })

  it('keeps a published zero fee as withdrawalFee "0"', () => {
    expect(ondoWithdrawableBalances('usdc', balance('599'), '0.00')).toEqual([
      {
        assetId: 'usdc',
        route: 'perps',
        available: '599',
        withdrawalFee: '0',
        isFeeDeducted: false,
      },
    ])
  })

  it('sets no fee or isFeeDeducted key when the venue fee is absent', () => {
    const [row] = ondoWithdrawableBalances('usdc', balance('599'))
    expect(row).toEqual({ assetId: 'usdc', route: 'perps', available: '599' })
    expect(row).not.toHaveProperty('withdrawalFee')
    expect(row).not.toHaveProperty('isFeeDeducted')
  })

  it('returns no row and reads no fee when nothing is withdrawable', () => {
    expect(ondoWithdrawableBalances('usdc', balance('0'), 'n/a')).toEqual([])
  })
})
