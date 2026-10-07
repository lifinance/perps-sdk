import {
  calculateTransferable,
  calculateWithdrawMax,
  isDecimalStringGreaterThan,
  type ProviderWithdrawableBalance,
  subtractDecimalString,
  unknownToDecimalString,
} from '@lifi/perps-sdk'
import { LIGHTER_PROVIDER_KEY, LIGHTER_SPOT_CATEGORY_ID } from '../constants.js'
import type { LtAccount } from '../types/account.js'

/**
 * Split each held asset into the two categories a Lighter withdrawal can
 * name: spot draws on `balance` net of `locked_balance`, perps draws on
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
 * @param perpsCategoryId - The instance's perps category id, the
 * `categoryId` its collateral `Balance` rows carry.
 * @public
 */
export const lighterWithdrawableBalances = (
  account: Pick<LtAccount, 'assets' | 'available_balance'>,
  settlementAssetIndex: number,
  perpsCategoryId: string
): ProviderWithdrawableBalance[] => {
  const rows: ProviderWithdrawableBalance[] = []
  for (const asset of account.assets) {
    const assetId = String(asset.asset_id)
    const spot = subtractDecimalString(
      unknownToDecimalString(asset.balance, 'balance', LIGHTER_PROVIDER_KEY),
      unknownToDecimalString(
        asset.locked_balance,
        'locked_balance',
        LIGHTER_PROVIDER_KEY
      )
    )
    if (isDecimalStringGreaterThan(spot, '0')) {
      rows.push({
        assetId,
        categoryId: LIGHTER_SPOT_CATEGORY_ID,
        available: spot,
        max: calculateWithdrawMax({ available: spot }),
      })
    }
    const marginBalance = unknownToDecimalString(
      asset.margin_balance,
      'margin_balance',
      LIGHTER_PROVIDER_KEY
    )
    const perps =
      asset.asset_id === settlementAssetIndex
        ? calculateTransferable(
            unknownToDecimalString(
              account.available_balance,
              'available_balance',
              LIGHTER_PROVIDER_KEY
            ),
            marginBalance
          )
        : marginBalance
    if (isDecimalStringGreaterThan(perps, '0')) {
      rows.push({
        assetId,
        categoryId: perpsCategoryId,
        available: perps,
        max: calculateWithdrawMax({ available: perps }),
      })
    }
  }
  return rows
}
