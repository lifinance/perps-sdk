/**
 * Lighter wire encoding for the WASM signer: scaled-integer decimal values,
 * basis-point margin fractions, and order-type/TIF/expiry resolution
 * mirroring the lighter-go signer's rules.
 */

import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import {
  LT_DEFAULT_ORDER_EXPIRY,
  LT_ORDER_TYPE_LIMIT,
  LT_ORDER_TYPE_MARKET,
  LT_ORDER_TYPE_STOP_LOSS,
  LT_ORDER_TYPE_STOP_LOSS_LIMIT,
  LT_ORDER_TYPE_TAKE_PROFIT,
  LT_ORDER_TYPE_TAKE_PROFIT_LIMIT,
  LT_TIME_IN_FORCE_GTC,
  LT_TIME_IN_FORCE_IOC,
  LT_TIME_IN_FORCE_POST_ONLY,
} from '../types/action.js'

/**
 * Lighter uses basis-points (1/10000) for margin fractions.
 * Convert to a decimal multiplier: 1000 → 0.1 (10x leverage).
 * @public
 */
export const marginFractionToMaxLeverage = (fraction: number): number => {
  if (!Number.isFinite(fraction) || fraction <= 0) {
    return 1
  }
  return Math.floor(10_000 / fraction)
}

/**
 * Convert leverage to margin fraction in basis points for WASM signer.
 * @public
 */
export const leverageToFraction = (leverage: number): number => {
  if (leverage <= 0) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid leverage: ${leverage}`
    )
  }
  return Math.round(10_000 / leverage)
}

/**
 * Off-grid resolution for {@link scaleToInteger}:
 * - `truncate` — toward zero, for sizes and collateral amounts. The wire
 *   value never exceeds the caller's intent.
 * - `round` — half away from zero, for prices, which snap to the nearest
 *   tick.
 * @public
 */
export type ScaleToIntegerPolicy = 'truncate' | 'round'

/**
 * Scale a human-readable decimal string to a scaled integer for the WASM
 * signer, in exact decimal arithmetic — an on-grid input maps to its exact
 * scaled integer with no binary float artifacts (`'0.29'` at 2 decimals is
 * 29, never 28). Off-grid input resolves per `policy`; there is no silent
 * default.
 *
 * @throws {PerpsError} `ValidationError` when `value` is not a decimal
 *   numeric string, `decimals` is not a non-negative integer, or the scaled
 *   result's magnitude exceeds `Number.MAX_SAFE_INTEGER`.
 * @public
 */
export const scaleToInteger = (
  value: string,
  decimals: number,
  policy: ScaleToIntegerPolicy
): number => {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid decimals for Lighter integer scaling: ${decimals}`
    )
  }
  let parsed: Big
  try {
    parsed = new Big(value)
  } catch {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid decimal string for Lighter integer scaling: '${value}'`
    )
  }
  const scaled = parsed
    .times(new Big(10).pow(decimals))
    .round(0, policy === 'truncate' ? Big.roundDown : Big.roundHalfUp)
  if (scaled.abs().gt(Number.MAX_SAFE_INTEGER)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Scaled value ${scaled.toFixed()} exceeds Number.MAX_SAFE_INTEGER and cannot be encoded exactly.`
    )
  }
  return scaled.toNumber()
}

/**
 * Map our OrderType enum to Lighter's integer order type.
 * @public
 */
export const mapOrderTypeToInt = (type?: string): number => {
  const map: Record<string, number> = {
    LIMIT: LT_ORDER_TYPE_LIMIT,
    MARKET: LT_ORDER_TYPE_MARKET,
    STOP_MARKET: LT_ORDER_TYPE_STOP_LOSS,
    STOP_LIMIT: LT_ORDER_TYPE_STOP_LOSS_LIMIT,
    TAKE_PROFIT_MARKET: LT_ORDER_TYPE_TAKE_PROFIT,
    TAKE_PROFIT_LIMIT: LT_ORDER_TYPE_TAKE_PROFIT_LIMIT,
  }
  return map[type ?? 'LIMIT'] ?? LT_ORDER_TYPE_LIMIT
}

/**
 * Lighter pairs each `order_type` with a permitted set of `time_in_force`
 * values: market-style orders (MARKET, STOP_MARKET, TAKE_PROFIT_MARKET) are
 * IOC by definition; limit-style orders may carry any TIF. The Go WASM
 * signer rejects mismatches with `OrderTimeInForce is not valid`. Resolve
 * the caller's optional `timeInForce` against the order type so unspecified
 * values land on the correct default and explicit values are validated up
 * front.
 * @public
 */
export const resolveTimeInForce = (
  orderTypeInt: number,
  tif?: string
): number => {
  const requested = tif === undefined ? undefined : mapTimeInForceToInt(tif)
  const isMarketStyle =
    orderTypeInt === LT_ORDER_TYPE_MARKET ||
    orderTypeInt === LT_ORDER_TYPE_STOP_LOSS ||
    orderTypeInt === LT_ORDER_TYPE_TAKE_PROFIT
  if (isMarketStyle) {
    if (requested !== undefined && requested !== LT_TIME_IN_FORCE_IOC) {
      throw new PerpsError(
        PerpsErrorCode.ValidationError,
        `Lighter market-style orders only accept IOC (got tif=${tif}).`
      )
    }
    return LT_TIME_IN_FORCE_IOC
  }
  return requested ?? LT_TIME_IN_FORCE_GTC
}

/**
 * Map our TimeInForce enum to Lighter's integer time-in-force.
 * @public
 */
export const mapTimeInForceToInt = (tif?: string): number => {
  const map: Record<string, number> = {
    IOC: LT_TIME_IN_FORCE_IOC,
    GTC: LT_TIME_IN_FORCE_GTC,
    POST_ONLY: LT_TIME_IN_FORCE_POST_ONLY,
  }
  return map[tif ?? 'GTC'] ?? LT_TIME_IN_FORCE_GTC
}

/**
 * Pick the `order_expiry` value Lighter expects for a given TIF on a
 * regular limit order. `lighter-go/types/txtypes/create_order.go:121-128`
 * enforces:
 *   - IOC limit orders → `OrderExpiry == NilOrderExpiry (0)`
 *   - non-IOC limit orders → `OrderExpiry != NilOrderExpiry`
 * For non-IOC we pass the `-1` sentinel, which the WASM signer rewrites
 * to `now + 28d` (absolute ms). Trigger orders take a different rule —
 * see {@link LT_DEFAULT_ORDER_EXPIRY} call sites.
 * @public
 */
export const orderExpiryForTif = (tifInt: number): number => {
  if (tifInt === LT_TIME_IN_FORCE_IOC) {
    return 0
  }
  return LT_DEFAULT_ORDER_EXPIRY
}
