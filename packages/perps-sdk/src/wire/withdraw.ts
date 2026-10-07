import type { DecimalString } from '@lifi/perps-types'
import { decimalStringToBig } from '../decimal/decimalStringToBig.js'
import type { WithdrawableBalance } from '../types/withdrawal.js'

/**
 * Largest `amount` a withdrawable row can fund: `available` when the venue
 * deducts the fee from the amount or publishes no fee, and
 * `available − withdrawalFee` floored at zero when the venue charges the fee
 * on top (`isFeeDeducted === false`).
 *
 * @throws {PerpsError} `ValidationError` when `available` or `withdrawalFee`
 *   is not a {@link DecimalString}, naming the field.
 * @public
 */
export function calculateWithdrawMax(
  row: Pick<
    WithdrawableBalance,
    'available' | 'withdrawalFee' | 'isFeeDeducted'
  >
): DecimalString {
  const available = decimalStringToBig(row.available)
  if (row.isFeeDeducted !== false || row.withdrawalFee === undefined) {
    return available.toFixed()
  }
  const funded = available.minus(decimalStringToBig(row.withdrawalFee))
  return funded.gt(0) ? funded.toFixed() : '0'
}
