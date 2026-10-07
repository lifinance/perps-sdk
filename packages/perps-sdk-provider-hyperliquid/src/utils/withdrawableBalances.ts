import {
  calculateWithdrawMax,
  isDecimalStringGreaterThan,
  type ProviderWithdrawableBalance,
  subtractDecimalString,
  unknownToDecimalString,
} from '@lifi/perps-sdk'
import { PROVIDER_KEY, SPOT_MARKET_ID } from '../constants.js'
import type {
  HlAbstractionMode,
  HlClearinghouseState,
  HlSpotClearinghouseState,
} from '../types/index.js'
import { isUnifiedAbstraction } from './abstractionMode.js'
import { assetIsOutcome } from './assetId.js'

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
 * @throws {PerpsError} `SDKError` when the fee or a venue figure is not a
 * decimal.
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
      : unknownToDecimalString(
          withdrawalFee,
          'providers.withdrawalFeeUsd',
          PROVIDER_KEY
        )
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
      const spot = subtractDecimalString(
        unknownToDecimalString(
          balance.total,
          'spotBalance.total',
          PROVIDER_KEY
        ),
        unknownToDecimalString(balance.hold, 'spotBalance.hold', PROVIDER_KEY)
      )
      if (isDecimalStringGreaterThan(spot, '0')) {
        const assetId = String(balance.token)
        const row = {
          assetId,
          categoryId: SPOT_MARKET_ID,
          available: spot,
          ...feeFor(assetId),
        }
        rows.push({ ...row, max: calculateWithdrawMax(row) })
      }
    }
  }

  const perps = unknownToDecimalString(
    state.withdrawable,
    'clearinghouseState.withdrawable',
    PROVIDER_KEY
  )
  if (isDecimalStringGreaterThan(perps, '0')) {
    const row = {
      assetId: quoteAssetId,
      categoryId: PROVIDER_KEY,
      available: perps,
      ...feeFor(quoteAssetId),
    }
    rows.push({ ...row, max: calculateWithdrawMax(row) })
  }

  return rows
}
