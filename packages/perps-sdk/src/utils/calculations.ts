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

// ---------------------------------------------------------------------------
// TP/SL expected P&L calculations
// ---------------------------------------------------------------------------

export interface ExpectedPnl {
  amount: number
  percent: number
}

/**
 * Calculate expected gain/loss for a TP or SL trigger price.
 * Returns signed values — positive means profit, negative means loss.
 *
 * @param triggerPrice - The TP or SL target price
 * @param entryPrice - Position entry / current market price
 * @param leverage - Position leverage multiplier
 * @param isLong - True for long positions, false for short
 * @param margin - Margin amount in USD
 */
export function calculateExpectedPnl(
  triggerPrice: number,
  entryPrice: number,
  leverage: number,
  isLong: boolean,
  margin: number
): ExpectedPnl | null {
  if (!triggerPrice || entryPrice === 0 || margin === 0) {
    return null
  }
  const priceDiff = isLong
    ? triggerPrice - entryPrice
    : entryPrice - triggerPrice
  const percent = (priceDiff / entryPrice) * leverage * 100
  const amount = margin * (percent / 100)
  return { amount, percent }
}

/**
 * Convert a percentage gain/loss to a target price.
 *
 * @param percent - Target gain/loss percentage (positive = profitable direction)
 * @param entryPrice - Position entry price
 * @param leverage - Position leverage multiplier
 * @param isLong - True for long positions, false for short
 */
export function priceFromPercent(
  percent: number,
  entryPrice: number,
  leverage: number,
  isLong: boolean
): number {
  if (entryPrice === 0 || leverage === 0) {
    return 0
  }
  const priceDelta = (percent / 100 / leverage) * entryPrice
  return isLong ? entryPrice + priceDelta : entryPrice - priceDelta
}

/**
 * Convert a target price to a percentage gain/loss.
 *
 * @param price - Target price
 * @param entryPrice - Position entry price
 * @param leverage - Position leverage multiplier
 * @param isLong - True for long positions, false for short
 */
export function percentFromPrice(
  price: number,
  entryPrice: number,
  leverage: number,
  isLong: boolean
): number {
  if (entryPrice === 0 || leverage === 0) {
    return 0
  }
  const priceDiff = isLong ? price - entryPrice : entryPrice - price
  return (priceDiff / entryPrice) * leverage * 100
}

// ---------------------------------------------------------------------------
// Realized PnL percentage
// ---------------------------------------------------------------------------

/**
 * Calculate realized PnL as a percentage of position value at close.
 *
 * @param realizedPnl - The realized profit/loss in USD
 * @param size - Position size in asset units at close
 * @param price - Price at close
 * @returns PnL as a percentage of position value
 */
export function calculateRealizedPnlPercent(
  realizedPnl: number,
  size: number,
  price: number
): number {
  const positionValue = Math.abs(size) * price
  if (positionValue === 0) {
    return 0
  }
  return (realizedPnl / positionValue) * 100
}
