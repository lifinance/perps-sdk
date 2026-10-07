import {
  calculateWithdrawMax,
  type ProviderWithdrawableBalance,
} from '@lifi/perps-sdk'
import { PROVIDER_KEY, SPOT_MARKET_ID } from '../constants.js'
import type {
  HlAbstractionMode,
  HlClearinghouseState,
  HlSpotClearinghouseState,
} from '../types/index.js'
import { isUnifiedAbstraction } from './abstractionMode.js'
import { assetIsOutcome } from './assetId.js'
import { toWireBig } from './decimal.js'

/**
 * Split a Hyperliquid account's venue figures into the categories a
 * withdrawal draws on. A unified or portfolio-margin account holds its collateral in spot,
 * so each spot token adds the part of `total` that no order or margin holds. A
 * category with nothing left to draw carries no row, and the caller applies the
 * per-asset venue minimum.
 *
 * @param quoteAssetId - `Asset.id` the perps-category row is keyed by.
 * @param withdrawalFee - Flat venue fee in quote-asset units, set on every
 *   quote-asset row. Hyperliquid deducts it from the requested amount. Absent
 *   leaves every row without a fee.
 * @public
 */
export const hyperliquidWithdrawableBalances = (
  abstraction: HlAbstractionMode | null,
  state: HlClearinghouseState,
  spotState: HlSpotClearinghouseState,
  quoteAssetId: string,
  withdrawalFee?: string
): ProviderWithdrawableBalance[] => {
  const rows: ProviderWithdrawableBalance[] = []
  const fee =
    withdrawalFee === undefined
      ? undefined
      : toWireBig(withdrawalFee, 'providers.withdrawalFeeUsd').toFixed()
  const feeFor = (
    assetId: string
  ): Pick<ProviderWithdrawableBalance, 'withdrawalFee' | 'isFeeDeducted'> =>
    fee === undefined || assetId !== quoteAssetId
      ? {}
      : { withdrawalFee: fee, isFeeDeducted: true }

  if (isUnifiedAbstraction(abstraction)) {
    for (const balance of spotState.balances) {
      if (assetIsOutcome(balance.coin)) {
        continue
      }
      const spot = toWireBig(balance.total, 'spotBalance.total').minus(
        toWireBig(balance.hold, 'spotBalance.hold')
      )
      if (spot.gt(0)) {
        const assetId = String(balance.token)
        const row = {
          assetId,
          categoryId: SPOT_MARKET_ID,
          available: spot.toFixed(),
          ...feeFor(assetId),
        }
        rows.push({ ...row, max: calculateWithdrawMax(row) })
      }
    }
  }

  const perps = toWireBig(state.withdrawable, 'clearinghouseState.withdrawable')
  if (perps.gt(0)) {
    const row = {
      assetId: quoteAssetId,
      categoryId: PROVIDER_KEY,
      available: perps.toFixed(),
      ...feeFor(quoteAssetId),
    }
    rows.push({ ...row, max: calculateWithdrawMax(row) })
  }

  return rows
}
