import {
  calculateWithdrawMax,
  type ProviderWithdrawableBalance,
  requireVenueDecimal,
} from '@lifi/perps-sdk'
import Big from 'big.js'
import { PROVIDER_KEY } from '../constants.js'
import type {
  HlAbstractionMode,
  HlClearinghouseState,
  HlSpotClearinghouseState,
} from '../types/index.js'
import { isUnifiedAbstraction } from './abstractionMode.js'
import { assetIsOutcome } from './assetId.js'

/**
 * Split a Hyperliquid account's venue figures into the routes a withdrawal
 * draws on. A unified or portfolio-margin account holds its collateral in spot,
 * so each spot token adds the part of `total` that no order or margin holds. A
 * route with nothing left to draw carries no row, and the caller applies the
 * per-asset venue minimum.
 *
 * @param quoteAssetId - `Asset.id` the perps-route row is keyed by.
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
      : new Big(
          requireVenueDecimal(
            withdrawalFee,
            'providers.withdrawalFeeUsd',
            PROVIDER_KEY
          )
        ).toFixed()
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
      const spot = new Big(
        requireVenueDecimal(balance.total, 'spotBalance.total', PROVIDER_KEY)
      ).minus(
        new Big(
          requireVenueDecimal(balance.hold, 'spotBalance.hold', PROVIDER_KEY)
        )
      )
      if (spot.gt(0)) {
        const assetId = String(balance.token)
        const row = {
          assetId,
          route: 'spot' as const,
          available: spot.toFixed(),
          ...feeFor(assetId),
        }
        rows.push({ ...row, max: calculateWithdrawMax(row) })
      }
    }
  }

  const perps = new Big(
    requireVenueDecimal(
      state.withdrawable,
      'clearinghouseState.withdrawable',
      PROVIDER_KEY
    )
  )
  if (perps.gt(0)) {
    const row = {
      assetId: quoteAssetId,
      route: 'perps' as const,
      available: perps.toFixed(),
      ...feeFor(quoteAssetId),
    }
    rows.push({ ...row, max: calculateWithdrawMax(row) })
  }

  return rows
}
