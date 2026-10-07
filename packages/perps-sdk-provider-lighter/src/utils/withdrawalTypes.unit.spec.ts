import { WithdrawalType } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { LIGHTER_SPOT_CATEGORY_ID } from '../constants.js'
import {
  type LighterFastWithdrawal,
  lighterFastWithdrawal,
  lighterWithdrawalTypes,
} from './withdrawalTypes.js'

const FAST_INFO = {
  code: 200,
  to_account_index: 7,
  withdraw_limit: '25000000',
  max_withdrawal_amount: '40000000',
}
const FEE_INFO = { code: 200, transfer_fee_usdc: 3_000_000 }

describe('lighterFastWithdrawal', () => {
  it('scales the lower venue limit from L2 6-decimal units', () => {
    expect(lighterFastWithdrawal(FAST_INFO, FEE_INFO)).toEqual({
      toAccountIndex: 7,
      fee: 3_000_000,
      limit: '25',
    })
    expect(
      lighterFastWithdrawal(
        { ...FAST_INFO, max_withdrawal_amount: '1500001' },
        FEE_INFO
      )?.limit
    ).toBe('1.500001')
  })

  it.each([
    ['info code 0', { ...FAST_INFO, code: 0 }, FEE_INFO],
    ['fee code 0', FAST_INFO, { ...FEE_INFO, code: 0 }],
    ['to_account_index 0', { ...FAST_INFO, to_account_index: 0 }, FEE_INFO],
  ])('returns undefined for %s', (_case, info, fee) => {
    expect(lighterFastWithdrawal(info, fee)).toBeUndefined()
  })

  it('throws on a limit that is not a decimal', () => {
    expect(() =>
      lighterFastWithdrawal({ ...FAST_INFO, withdraw_limit: 'n/a' }, FEE_INFO)
    ).toThrow('withdraw_limit')
  })
})

describe('lighterWithdrawalTypes', () => {
  const FAST: LighterFastWithdrawal = {
    toAccountIndex: 7,
    fee: 3_000_000,
    limit: '25',
  }
  const FAST_SOURCE = { categoryId: 'perps', asset: { id: '3' } }
  const ROWS = [
    {
      assetId: '3',
      categoryId: LIGHTER_SPOT_CATEGORY_ID,
      available: '10',
      max: '10',
    },
    { assetId: '3', categoryId: 'perps', available: '60', max: '60' },
    { assetId: '1', categoryId: 'perps', available: '4', max: '4' },
  ]
  const types = (fast: LighterFastWithdrawal | undefined) =>
    lighterWithdrawalTypes(ROWS, FAST_SOURCE, fast).map((row) => [
      row.source.categoryId,
      row.source.asset.id,
      row.options.map((o) => [o.type, o.max]),
    ])

  it('offers FAST on the collateral perps row only', () => {
    expect(types(FAST)).toEqual([
      [LIGHTER_SPOT_CATEGORY_ID, '3', [[WithdrawalType.STANDARD, '10']]],
      [
        'perps',
        '3',
        [
          [WithdrawalType.STANDARD, '60'],
          [WithdrawalType.FAST, '25'],
        ],
      ],
      ['perps', '1', [[WithdrawalType.STANDARD, '4']]],
    ])
  })

  it('caps FAST at the row max', () => {
    expect(types({ ...FAST, limit: '100' })[1][2]).toEqual([
      [WithdrawalType.STANDARD, '60'],
      [WithdrawalType.FAST, '60'],
    ])
  })

  it('offers STANDARD only without fast-withdraw terms', () => {
    expect(
      types(undefined).every(
        ([, , options]) =>
          options.length === 1 && options[0][0] === WithdrawalType.STANDARD
      )
    ).toBe(true)
  })

  it('carries the Lighter withdrawal options for each type', () => {
    const [, collateral] = lighterWithdrawalTypes(ROWS, FAST_SOURCE, FAST)
    expect(collateral.options.map((o) => o.withdrawalOptions)).toEqual([
      { mode: 'standard' },
      { mode: 'fast', toAccountIndex: 7, fee: 3_000_000 },
    ])
  })
})
