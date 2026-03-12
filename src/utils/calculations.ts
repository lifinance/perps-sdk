/**
 * Universal perpetual futures calculation utilities.
 *
 * Pure functions for computing position-related values that any consumer
 * of the perps SDK would need. All parameters are required — no default
 * values for critical financial parameters.
 */

/**
 * Calculate position size in asset units from margin.
 *
 * @param marginUsd - Margin amount in USD
 * @param leverage - Position leverage
 * @param price - Current asset price
 * @returns Position size in asset units
 */
export function calculatePositionSize(
  marginUsd: number,
  leverage: number,
  price: number
): number {
  return (marginUsd * leverage) / price
}

/**
 * Calculate notional value of a position.
 *
 * @param size - Position size in asset units
 * @param price - Current asset price
 * @returns Notional value in USD
 */
export function calculateNotionalValue(size: number, price: number): number {
  return Math.abs(size) * price
}

/**
 * Calculate unrealized PnL.
 *
 * @param entryPrice - Position entry price
 * @param currentPrice - Current market price
 * @param size - Position size (positive for long, negative for short)
 * @returns Unrealized PnL in USD
 */
export function calculateUnrealizedPnl(
  entryPrice: number,
  currentPrice: number,
  size: number
): number {
  return (currentPrice - entryPrice) * size
}

/**
 * Calculate return on equity (ROE) percentage.
 *
 * @param pnl - Profit/loss in USD
 * @param margin - Initial margin in USD
 * @returns ROE as percentage (e.g., 10 for 10%)
 */
export function calculateRoe(pnl: number, margin: number): number {
  if (margin === 0) {
    return 0
  }
  return (pnl / margin) * 100
}

/**
 * Calculate required margin for a position.
 *
 * @param notionalValue - Position notional value in USD
 * @param leverage - Position leverage
 * @returns Required margin in USD
 */
export function calculateRequiredMargin(
  notionalValue: number,
  leverage: number
): number {
  return notionalValue / leverage
}

/**
 * Estimate trading fees.
 *
 * @param sizeUsd - Position size in USD (notional value)
 * @param feeRate - Fee rate as decimal (e.g., 0.00035 for 0.035%)
 * @returns Estimated fee in USD
 */
export function estimateFees(sizeUsd: number, feeRate: number): number {
  return sizeUsd * feeRate
}

/**
 * Apply slippage to a price for order execution.
 *
 * @param price - Base price
 * @param slippagePercent - Slippage tolerance as percentage (e.g., 0.5 for 0.5%)
 * @param isBuy - True if buying (price goes up), false if selling (price goes down)
 * @returns Price adjusted for slippage
 */
export function applySlippage(
  price: number,
  slippagePercent: number,
  isBuy: boolean
): number {
  const multiplier = 1 + slippagePercent / 100
  return isBuy ? price * multiplier : price / multiplier
}
