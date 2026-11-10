import {
  createWarnOnce,
  isDecimalStringGreaterThan,
  safeSubtractDecimalString,
} from '@lifi/perps-sdk'
import type { Fee } from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoFill } from '../types/wire.js'

const warnNegativeRebateOnce = createWarnOnce()

/**
 * Build the net Ondo fee and its rebate. A malformed fee or rebate omits the
 * fee, and so does a negative rebate: Ondo documents `feeRebate` as earned.
 */
export const buildFee = (
  row: Pick<OndoFill, 'fee' | 'feeRebate'>,
  asset: string
): Fee | undefined => {
  const netFeeAmount = safeSubtractDecimalString(row.fee, row.feeRebate ?? '0')
  if (netFeeAmount === undefined) {
    return undefined
  }
  if (row.feeRebate === undefined) {
    return { amount: netFeeAmount, asset }
  }
  if (isDecimalStringGreaterThan('0', row.feeRebate)) {
    warnNegativeRebateOnce(
      `${ONDO_PROVIDER_KEY}|feeRebate`,
      `[${ONDO_PROVIDER_KEY}] \`feeRebate\` is negative, so the fee is absent: '${row.feeRebate.slice(0, 64)}'`
    )
    return undefined
  }
  return { amount: netFeeAmount, asset, rebate: row.feeRebate }
}
