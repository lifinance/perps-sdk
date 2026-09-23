import type { ProviderWithdrawableBalance } from '@lifi/perps-sdk'
import type { OndoBalanceSummary } from '../types/wire.js'
import { toWireBig } from './decimal.js'

/**
 * The single route an Ondo withdrawal draws on: `withdrawableMargin`, the
 * venue's own figure for the margin the account can take out. A route with
 * nothing left to draw carries no row, and the caller applies the per-asset
 * venue minimum.
 *
 * @param assetId - `Asset.id` the row is keyed by.
 * @param withdrawalFeeUsd - The account's `withdrawalFeeUSD`. Ondo collateral
 *   is USDC, so the USD fee is the row fee 1:1 in collateral units. Absent
 *   leaves the row without a fee.
 * @public
 */
export const ondoWithdrawableBalances = (
  assetId: string,
  balance: OndoBalanceSummary,
  withdrawalFeeUsd?: string
): ProviderWithdrawableBalance[] => {
  const available = toWireBig(
    balance.withdrawableMargin,
    'balance.withdrawableMargin'
  )
  if (!available.gt(0)) {
    return []
  }
  return [
    {
      assetId,
      route: 'perps',
      available: available.toFixed(),
      ...(withdrawalFeeUsd === undefined
        ? {}
        : {
            withdrawalFee: toWireBig(
              withdrawalFeeUsd,
              'account.withdrawalFeeUSD'
            ).toFixed(),
          }),
    },
  ]
}
