import type { DecimalString } from '@lifi/perps-types'
import { requireDecimal } from '../decimal/requireDecimal.js'
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
  const available = requireDecimal(row.available, 'available')
  if (row.isFeeDeducted !== false || row.withdrawalFee === undefined) {
    return available.toFixed()
  }
  const funded = available.minus(
    requireDecimal(row.withdrawalFee, 'withdrawalFee')
  )
  return funded.gt(0) ? funded.toFixed() : '0'
}
