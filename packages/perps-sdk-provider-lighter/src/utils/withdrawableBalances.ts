import {
  calculateTransferable,
  calculateWithdrawMax,
  type ProviderWithdrawableBalance,
  requireVenueDecimal,
} from '@lifi/perps-sdk'
import Big from 'big.js'
import { LIGHTER_PROVIDER_KEY } from '../constants.js'
import type { LtAccount } from '../types/account.js'

/**
 * Split each held asset into the two routes a Lighter withdrawal can name:
 * spot draws on `balance` net of `locked_balance`, perps draws on
 * `margin_balance`. The settlement asset's perps route is also capped by the
 * account `available_balance`, which excludes the margin open positions use.
 * Every other asset's perps route reports its full `margin_balance`, uncapped,
 * although `getAccount` reports `transferable: '0'` for it: a category
 * transfer moves only the settlement asset. Routes with nothing left to draw
 * are dropped; the per-asset venue minimum is applied by the caller holding
 * the asset registry.
 *
 * @param settlementAssetIndex - L2 asset index of the deployment's collateral
 * asset, the only asset that `available_balance` is denominated in.
 * @public
 */
export const lighterWithdrawableBalances = (
  account: Pick<LtAccount, 'assets' | 'available_balance'>,
  settlementAssetIndex: number
): ProviderWithdrawableBalance[] => {
  const rows: ProviderWithdrawableBalance[] = []
  for (const asset of account.assets) {
    const assetId = String(asset.asset_id)
    const spot = new Big(
      requireVenueDecimal(asset.balance, 'balance', LIGHTER_PROVIDER_KEY)
    ).minus(
      new Big(
        requireVenueDecimal(
          asset.locked_balance,
          'locked_balance',
          LIGHTER_PROVIDER_KEY
        )
      )
    )
    if (spot.gt(0)) {
      const available = spot.toFixed()
      rows.push({
        assetId,
        route: 'spot',
        available,
        max: calculateWithdrawMax({ available }),
      })
    }
    const marginBalance = new Big(
      requireVenueDecimal(
        asset.margin_balance,
        'margin_balance',
        LIGHTER_PROVIDER_KEY
      )
    )
    const perps =
      asset.asset_id === settlementAssetIndex
        ? calculateTransferable(
            new Big(
              requireVenueDecimal(
                account.available_balance,
                'available_balance',
                LIGHTER_PROVIDER_KEY
              )
            ).toFixed(),
            marginBalance.toFixed()
          )
        : marginBalance.toFixed()
    if (new Big(perps).gt(0)) {
      rows.push({
        assetId,
        route: 'perps',
        available: perps,
        max: calculateWithdrawMax({ available: perps }),
      })
    }
  }
  return rows
}
