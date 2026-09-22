import type { ProviderWithdrawableBalance } from '@lifi/perps-sdk'
import Big from 'big.js'
import type { OndoBalanceSummary } from '../types/wire.js'

/**
 * The single route an Ondo withdrawal draws on: `withdrawableMargin`, the
 * venue's own figure for the margin the account can take out. A route with
 * nothing left to draw carries no row, and the caller applies the per-asset
 * venue minimum.
 *
 * @param assetId - `Asset.id` the row is keyed by.
 * @public
 */
export const ondoWithdrawableBalances = (
  assetId: string,
  balance: OndoBalanceSummary
): ProviderWithdrawableBalance[] => {
  const available = new Big(balance.withdrawableMargin)
  return available.gt(0)
    ? [{ assetId, route: 'perps', available: available.toFixed() }]
    : []
}
