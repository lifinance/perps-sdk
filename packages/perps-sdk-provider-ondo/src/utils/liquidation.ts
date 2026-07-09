/**
 * Ondo liquidation price estimation.
 *
 * The LI.FI backend surfaces Ondo's per-market maintenance margin rate on the
 * generic {@link PerpsMarket} as `maintenanceMarginRate`. The estimate is the
 * standard isolated-margin model parameterised by that rate.
 */

import {
  estimateIsolatedLiquidationPrice,
  type LiquidationEstimateParams,
} from '@lifi/perps-sdk'
import type { PerpsMarket } from '@lifi/perps-types'

/**
 * Estimate the liquidation price of a new position on an Ondo market.
 *
 * @returns The estimated liquidation price, or `undefined` when
 *   `market.maintenanceMarginRate` is absent (the model cannot be evaluated
 *   without the venue's maintenance margin rate) or the inputs are
 *   degenerate.
 * @public
 */
export function estimateLiquidationPrice(
  market: PerpsMarket,
  params: LiquidationEstimateParams
): number | undefined {
  if (market.maintenanceMarginRate === undefined) {
    return undefined
  }
  return estimateIsolatedLiquidationPrice({
    entryPrice: params.entryPrice,
    leverage: params.leverage,
    isLong: params.isLong,
    maintenanceMarginRate: market.maintenanceMarginRate,
  })
}
