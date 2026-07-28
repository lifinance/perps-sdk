/**
 * Lighter wire encoding for the WASM signer: basis-point margin fractions and
 * order-type/time-in-force/expiry resolution mirroring lighter-go's rules.
 */

import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
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
 * Convert Lighter's initial-margin fraction to the largest whole-number
 * leverage exposed by the provider.
 *
 * Lighter expresses margin fractions in basis points (`10_000` = 100%), so
 * the conversion is `floor(10_000 / fraction)`. Non-finite or non-positive
 * input uses the safe `1x` fallback.
 *
 * @param fraction - Lighter's basis-point initial-margin fraction.
 * @returns The floored maximum leverage, or `1` for invalid input.
 * @public
 */
export const marginFractionToMaxLeverage = (fraction: number): number => {
  if (!Number.isFinite(fraction) || fraction <= 0) {
    return 1
  }
  return Math.floor(10_000 / fraction)
}

/**
 * Convert requested leverage to Lighter's basis-point margin fraction.
 *
 * The signer expects `round(10_000 / leverage)`, where the result is the
 * margin requirement in basis points.
 *
 * @param leverage - Requested leverage multiplier.
 * @returns The rounded basis-point margin fraction.
 * @throws {PerpsError} With `ValidationError` when leverage is less than
 * or equal to zero.
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
 * Map a LI.FI `OrderType` value to Lighter's integer wire type.
 *
 * Supported mappings are LIMIT → 0, MARKET → 1, STOP_MARKET → 2,
 * STOP_LIMIT → 3, TAKE_PROFIT_MARKET → 4, and TAKE_PROFIT_LIMIT → 5.
 * Omitted or unknown values fall back to LIMIT.
 *
 * @param type - LI.FI order type value.
 * @returns The corresponding Lighter order-type integer.
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
 * Resolve a Lighter `time_in_force` value that is valid for an order type.
 *
 * Market-style orders (MARKET, STOP_MARKET, TAKE_PROFIT_MARKET) are IOC-only.
 * Limit-style orders default to GTC when no TIF is supplied. An explicit
 * non-IOC TIF on a market-style order raises a validation error. For
 * limit-style orders, unknown TIF strings use the GTC fallback from
 * {@link mapTimeInForceToInt}.
 *
 * @param orderTypeInt - Lighter order-type integer.
 * @param tif - Optional LI.FI time-in-force value.
 * @returns The validated Lighter time-in-force integer.
 * @throws {PerpsError} With `ValidationError` for a market-style/TIF mismatch.
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
 * Map a LI.FI time-in-force value to Lighter's integer wire value.
 *
 * IOC maps to 0, GTC maps to 1, and POST_ONLY maps to 2. Omitted or unknown
 * values fall back to GTC.
 *
 * @param tif - LI.FI time-in-force value.
 * @returns The corresponding Lighter time-in-force integer.
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
 * Select the `order_expiry` sentinel required for a regular Lighter limit
 * order from its resolved time-in-force.
 *
 * IOC uses Lighter's nil expiry (`0`). Every other TIF uses
 * `LT_DEFAULT_ORDER_EXPIRY` (`-1`), which the WASM signer expands to its
 * canonical future expiry (`now + 28d`) as an absolute Unix-millisecond
 * timestamp. Trigger-order expiry handling is provider-specific; see
 * {@link LT_DEFAULT_ORDER_EXPIRY} and its call sites.
 *
 * @param tifInt - Lighter time-in-force integer.
 * @returns `0` for IOC, otherwise the default-expiry sentinel.
 * @public
 */
export const orderExpiryForTif = (tifInt: number): number => {
  if (tifInt === LT_TIME_IN_FORCE_IOC) {
    return 0
  }
  return LT_DEFAULT_ORDER_EXPIRY
}
