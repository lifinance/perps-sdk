import { safeSubtractDecimalString } from '@lifi/perps-sdk'
import type { Fee } from '@lifi/perps-types'
import type { OndoFill } from '../types/wire.js'

/** Build the net Ondo fee and its rebate, or omit the fee when either is malformed. */
export const buildFee = (
  row: Pick<OndoFill, 'fee' | 'feeRebate'>,
  asset: string
): Fee | undefined => {
  const netFeeAmount = safeSubtractDecimalString(row.fee, row.feeRebate ?? '0')
  return netFeeAmount === undefined
    ? undefined
    : {
        amount: netFeeAmount,
        asset,
        ...(row.feeRebate !== undefined ? { rebate: row.feeRebate } : {}),
      }
}
