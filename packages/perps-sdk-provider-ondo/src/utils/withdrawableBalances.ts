import {
  calculateWithdrawMax,
  isDecimalStringGreaterThan,
  type ProviderWithdrawableBalance,
  unknownToDecimalString,
} from '@lifi/perps-sdk'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoBalanceSummary } from '../types/wire.js'

/**
 * The single category an Ondo withdrawal draws on: `withdrawableMargin`, the
 * venue's own figure for the margin the account can take out. A category with
 * nothing left to draw carries no row, and the caller applies the per-asset
 * venue minimum.
 *
 * @param assetId - `Asset.id` the row is keyed by.
 * @param withdrawalFeeUsd - The account's `withdrawalFeeUSD`. Ondo collateral
 * is USDC, so the USD fee is the row fee 1:1 in collateral units. Ondo
 * charges it on top of the requested amount. Absent leaves the row without a
 * fee.
 * @public
 */
export const ondoWithdrawableBalances = (
  assetId: string,
  balance: OndoBalanceSummary,
  withdrawalFeeUsd?: string
): ProviderWithdrawableBalance[] => {
  const available = unknownToDecimalString(
    balance.withdrawableMargin,
    'balance.withdrawableMargin',
    ONDO_PROVIDER_KEY
  )
  if (!isDecimalStringGreaterThan(available, '0')) {
    return []
  }
  const row = {
    assetId,
    categoryId: ONDO_PROVIDER_KEY,
    available,
    ...(withdrawalFeeUsd === undefined
      ? {}
      : {
          withdrawalFee: unknownToDecimalString(
            withdrawalFeeUsd,
            'account.withdrawalFeeUSD',
            ONDO_PROVIDER_KEY
          ),
          isFeeDeducted: false,
        }),
  }
  return [{ ...row, max: calculateWithdrawMax(row) }]
}
