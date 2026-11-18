import { absDecimalString, timestampToIsoString } from '@lifi/perps-sdk'
import {
  ActivityType,
  type Asset,
  type DepositActivity,
  type WithdrawalActivity,
} from '@lifi/perps-types'
import { EXTENDED_PROVIDER_KEY } from '../constants.js'
import type { ExtendedAssetOperation } from '../types/wire.js'

/**
 * Map a completed Extended deposit or withdrawal to an activity, or `null`
 * for another operation type or a status under which no value moved yet.
 * Extended holds one collateral asset, so every operation is in `collateral`.
 * Extended signs withdrawal amounts negative; the activity amount is absolute.
 *
 * @public
 */
export const mapAssetOperation = (
  operation: ExtendedAssetOperation,
  collateral: Asset
): DepositActivity | WithdrawalActivity | null => {
  if (operation.status !== 'COMPLETED') {
    return null
  }
  const base = {
    id: String(operation.id),
    provider: EXTENDED_PROVIDER_KEY,
    timestamp: timestampToIsoString(operation.time),
    asset: collateral,
    amount: absDecimalString(operation.amount),
  }
  switch (operation.type) {
    case 'DEPOSIT':
      return { ...base, type: ActivityType.DEPOSIT }
    case 'WITHDRAWAL':
      return {
        ...base,
        type: ActivityType.WITHDRAWAL,
        fee: { amount: operation.fee, asset: collateral.displaySymbol },
      }
    default:
      return null
  }
}
