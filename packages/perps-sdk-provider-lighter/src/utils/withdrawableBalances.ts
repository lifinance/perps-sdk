import type { ProviderWithdrawableBalance } from '@lifi/perps-sdk'
import type { LtAccountAsset } from '../types/account.js'
import { toRequiredBig } from './decimal.js'

/**
 * Split each held asset into the two routes a Lighter withdrawal can name:
 * spot draws on `balance` net of `locked_balance`, perps draws on
 * `margin_balance`. Routes with nothing left to draw are dropped; the
 * per-asset venue minimum is applied by the caller holding the asset registry.
 *
 * @public
 */
export const lighterWithdrawableBalances = (
  assets: LtAccountAsset[]
): ProviderWithdrawableBalance[] => {
  const rows: ProviderWithdrawableBalance[] = []
  for (const asset of assets) {
    const assetId = String(asset.asset_id)
    const spot = toRequiredBig(asset.balance, 'balance').minus(
      toRequiredBig(asset.locked_balance, 'locked_balance')
    )
    if (spot.gt(0)) {
      rows.push({ assetId, route: 'spot', available: spot.toFixed() })
    }
    const perps = toRequiredBig(asset.margin_balance, 'margin_balance')
    if (perps.gt(0)) {
      rows.push({ assetId, route: 'perps', available: perps.toFixed() })
    }
  }
  return rows
}
