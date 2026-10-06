import type {
  ProviderWithdrawableBalance,
  WithdrawalAssetRef,
  WithdrawalSourceTypes,
  WithdrawalTypeOption,
} from '@lifi/perps-sdk'
import { WithdrawalType } from '@lifi/perps-types'
import Big from 'big.js'
import type {
  LtFastwithdrawInfoResponse,
  LtTransferFeeInfoResponse,
} from '../types/submit.js'
import { toRequiredBig } from './decimal.js'

const LIGHTER_SUCCESS_CODE = 200
const L2_COLLATERAL_SCALE = 1_000_000

/**
 * The `withdrawalOptions` a Lighter withdrawal accepts. `fast` sends the
 * amount to the fast-withdraw operator account `toAccountIndex`; `fee` is the
 * transfer fee in L2 6-decimal integer units.
 *
 * @public
 */
export type LighterWithdrawalOptions =
  | { mode: 'standard' }
  | { mode: 'fast'; toAccountIndex: number; fee: number }

/**
 * The fast-withdraw terms Lighter offers an account.
 *
 * @public
 */
export interface LighterFastWithdrawal {
  toAccountIndex: number
  fee: number
  /** The lower of `withdraw_limit` and `max_withdrawal_amount`, in collateral units. */
  limit: string
}

/**
 * The fast-withdraw terms from `/fastwithdraw/info` and `/transferFeeInfo`, or
 * `undefined` when either read reports a code other than 200 or no operator
 * account is set.
 *
 * @throws {PerpsError} When a limit is not a decimal.
 * @public
 */
export const lighterFastWithdrawal = (
  info: LtFastwithdrawInfoResponse,
  feeInfo: LtTransferFeeInfoResponse
): LighterFastWithdrawal | undefined => {
  if (
    info.code !== LIGHTER_SUCCESS_CODE ||
    feeInfo.code !== LIGHTER_SUCCESS_CODE ||
    !(info.to_account_index > 0)
  ) {
    return undefined
  }
  const withdrawLimit = toRequiredBig(info.withdraw_limit, 'withdraw_limit')
  const maxWithdrawalAmount = toRequiredBig(
    info.max_withdrawal_amount,
    'max_withdrawal_amount'
  )
  const limit = withdrawLimit.lt(maxWithdrawalAmount)
    ? withdrawLimit
    : maxWithdrawalAmount
  return {
    toAccountIndex: info.to_account_index,
    fee: feeInfo.transfer_fee_usdc,
    limit: limit.div(L2_COLLATERAL_SCALE).toFixed(),
  }
}

/**
 * The withdrawal types per withdrawable row. Every row offers `STANDARD` up to
 * its `max`. The `fastSource` row also offers `FAST` when `fast` is set, up to
 * the lower of its `max` and `fast.limit`.
 *
 * @public
 */
export const lighterWithdrawalTypes = (
  rows: ProviderWithdrawableBalance[],
  fastSource: WithdrawalAssetRef,
  fast: LighterFastWithdrawal | undefined
): WithdrawalSourceTypes[] =>
  rows.map((row) => {
    const standard: LighterWithdrawalOptions = { mode: 'standard' }
    const options: WithdrawalTypeOption[] = [
      {
        type: WithdrawalType.STANDARD,
        max: row.max,
        withdrawalOptions: standard,
      },
    ]
    if (
      fast !== undefined &&
      row.categoryId === fastSource.categoryId &&
      row.assetId === fastSource.asset.id
    ) {
      const rowMax = new Big(row.max)
      const fastOptions: LighterWithdrawalOptions = {
        mode: 'fast',
        toAccountIndex: fast.toAccountIndex,
        fee: fast.fee,
      }
      options.push({
        type: WithdrawalType.FAST,
        max: (rowMax.lt(fast.limit) ? rowMax : new Big(fast.limit)).toFixed(),
        withdrawalOptions: fastOptions,
      })
    }
    return {
      source: { categoryId: row.categoryId, asset: { id: row.assetId } },
      options,
    }
  })
