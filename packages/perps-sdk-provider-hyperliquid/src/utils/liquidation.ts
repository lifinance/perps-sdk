/**
 * Hyperliquid-specific liquidation price calculation.
 *
 * Uses the exact formula from Hyperliquid docs:
 * https://hyperliquid.gitbook.io/hyperliquid-docs/trading/liquidations
 *
 * liq_price = price - side * margin_available / position_size / (1 - l * side)
 *
 * Where:
 * - l = 1 / (2 * maxLeverage) (maintenance margin fraction)
 * - side = 1 (long) or -1 (short)
 * - margin_available = isolated_margin - maintenance_margin_required
 */

import { estimateIsolatedLiquidationPrice } from '@lifi/perps-sdk'

/**
 * Calculate the maintenance margin fraction for a Hyperliquid asset.
 *
 * Maintenance margin is half of the initial margin at max leverage.
 *
 * @param maxLeverage - Maximum leverage for the asset (e.g., 50 for BTC)
 * @returns Maintenance margin fraction (e.g., 0.01 for 50x max leverage),
 *   or undefined if maxLeverage is zero
 * @public
 */
export function calculateMaintenanceMarginRate(
  maxLeverage: number
): number | undefined {
  if (maxLeverage === 0) {
    return undefined
  }
  return 1 / (2 * maxLeverage)
}

/**
 * Calculate liquidation price using the exact Hyperliquid formula.
 *
 * For isolated margin, new position prediction. For existing positions,
 * prefer Position.liquidationPrice from the API.
 *
 * Formula derivation (isolated margin, single position):
 *   margin_per_unit        = entryPrice / leverage
 *   maintenance_per_unit   = entryPrice * mmr
 *   margin_available       = margin_per_unit - maintenance_per_unit
 *   liq_price              = entryPrice - side * margin_available / (1 - mmr * side)
 *
 * Where mmr = 1 / (2 * maxLeverage).
 *
 * @param entryPrice - Position entry price
 * @param leverage - User-selected leverage (e.g., 10)
 * @param isLong - True if long position, false if short
 * @param maxLeverage - Asset's maximum leverage (e.g., 50 for BTC). Determines
 *   the maintenance margin rate: mmr = 1 / (2 * maxLeverage)
 * @returns Estimated liquidation price, or undefined if inputs are invalid
 * @public
 */
export function calculateLiquidationPrice(
  entryPrice: number,
  leverage: number,
  isLong: boolean,
  maxLeverage: number
): number | undefined {
  const mmr = calculateMaintenanceMarginRate(maxLeverage)
  if (mmr === undefined) {
    return undefined
  }
  return estimateIsolatedLiquidationPrice({
    entryPrice,
    leverage,
    isLong,
    maintenanceMarginRate: mmr,
  })
}
