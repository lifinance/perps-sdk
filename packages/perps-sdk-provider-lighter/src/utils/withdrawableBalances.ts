import type { ProviderWithdrawableBalance } from '@lifi/perps-sdk'
import Big from 'big.js'
import type { LtAccount } from '../types/account.js'
import { toRequiredBig } from './decimal.js'

/**
 * The part of `units` that a venue-wide free figure releases: never below
 * zero and never above the units held.
 */
export const transferableWithin = (venueFigure: Big, units: Big): Big => {
  if (venueFigure.lt(0)) {
    return new Big(0)
  }
  return venueFigure.gt(units) ? units : venueFigure
}

/**
 * Split each held asset into the two routes a Lighter withdrawal can name:
 * spot draws on `balance` net of `locked_balance`, perps draws on
 * `margin_balance`. The settlement asset's perps route is also capped by the
 * account `available_balance`, which excludes the margin open positions use.
 * Routes with nothing left to draw are dropped; the per-asset venue minimum
 * is applied by the caller holding the asset registry.
 *
 * @param settlementAssetIndex - L2 asset index of the deployment's collateral
 * asset, the only asset that `available_balance` is denominated in.
 * @public
 */
export const lighterWithdrawableBalances = (
  account: Pick<LtAccount, 'assets' | 'available_balance'>,
  settlementAssetIndex: number
): ProviderWithdrawableBalance[] => {
  const availableBalance = toRequiredBig(
    account.available_balance,
    'available_balance'
  )
  const rows: ProviderWithdrawableBalance[] = []
  for (const asset of account.assets) {
    const assetId = String(asset.asset_id)
    const spot = toRequiredBig(asset.balance, 'balance').minus(
      toRequiredBig(asset.locked_balance, 'locked_balance')
    )
    if (spot.gt(0)) {
      rows.push({ assetId, route: 'spot', available: spot.toFixed() })
    }
    const marginBalance = toRequiredBig(asset.margin_balance, 'margin_balance')
    const perps =
      asset.asset_id === settlementAssetIndex
        ? transferableWithin(availableBalance, marginBalance)
        : marginBalance
    if (perps.gt(0)) {
      rows.push({ assetId, route: 'perps', available: perps.toFixed() })
    }
  }
  return rows
}
