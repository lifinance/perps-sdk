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

import {
  createSafeFunction,
  divideDecimalString,
  estimateLiquidationPrice,
  numberToDecimalString,
  PerpsError,
} from '@lifi/perps-sdk'
import { type DecimalString, PerpsErrorCode } from '@lifi/perps-types'

/**
 * Maintenance margin fraction for a Hyperliquid asset: half of the initial
 * margin at max leverage, `1 / (2 × maxLeverage)`.
 *
 * @param maxLeverage - Maximum leverage for the asset (e.g., 50 for BTC)
 * @returns Maintenance margin fraction (`'0.01'` for 50x max leverage)
 * @throws {PerpsError} `ValidationError` when `maxLeverage` is not a finite
 *   number above zero.
 * @public
 */
export function calculateMaintenanceMarginRate(
  maxLeverage: number
): DecimalString {
  if (!Number.isFinite(maxLeverage) || maxLeverage <= 0) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `\`maxLeverage\` must be a finite number above zero, got ${maxLeverage}.`
    )
  }
  return divideDecimalString('1', numberToDecimalString(2 * maxLeverage))
}

/** @public */
export const safeCalculateMaintenanceMarginRate = createSafeFunction(
  'calculateMaintenanceMarginRate',
  calculateMaintenanceMarginRate
)

/**
 * Liquidation price of a new isolated position with the exact Hyperliquid
 * formula. For an existing position, prefer `Position.liquidationPrice` from
 * the API.
 *
 * Formula derivation (isolated margin, single position):
 *   margin_available = entryPrice × (1 / leverage - mmr)
 *   liq_price        = entryPrice - side × margin_available / (1 - mmr × side)
 *
 * @param leverage - User-selected leverage (e.g., `'10'`)
 * @param maxLeverage - Asset's maximum leverage (e.g., 50 for BTC). Sets
 *   mmr = 1 / (2 × maxLeverage).
 * @throws {PerpsError} `ValidationError` when `maxLeverage` is not a finite
 *   number above zero, or on an input that `estimateLiquidationPrice` rejects.
 * @public
 */
export function calculateLiquidationPrice(
  entryPrice: string,
  leverage: string,
  isLong: boolean,
  maxLeverage: number
): string {
  return estimateLiquidationPrice({
    entryPrice,
    leverage,
    isLong,
    maintenanceMarginRate: calculateMaintenanceMarginRate(maxLeverage),
  })
}

/** @public */
export const safeCalculateLiquidationPrice = createSafeFunction(
  'calculateLiquidationPrice',
  calculateLiquidationPrice
)
