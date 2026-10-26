/**
 * Lighter order size and price snapping for exchange submission.
 *
 * Lighter publishes a flat per-market decimal budget on its order books
 * (`supported_price_decimals` / `supported_size_decimals`), surfaced on the
 * generic {@link Market} as `priceDecimals` / `szDecimals`. Prices round onto
 * the tick grid; sizes truncate onto the lot grid.
 */

import {
  addDecimalString,
  compareDecimalStrings,
  multiplyDecimalString,
  PerpsError,
  roundDecimalString,
  type SlippageAdjustedLimitPriceParams,
  subtractDecimalString,
} from '@lifi/perps-sdk'
import {
  type DecimalString,
  type Market,
  OrderSide,
  PerpsErrorCode,
} from '@lifi/perps-types'
import Big from 'big.js'

/**
 * Range of the Lighter market TP/SL slippage input, as decimal string
 * percents (`'1'` is 1%). The minimum is above Lighter's own `0`, because a
 * 0% bound can leave the trigger order unfilled and the position unprotected.
 *
 * @public
 */
export const LIGHTER_MARKET_SLIPPAGE_PERCENT = {
  min: '1',
  max: '10',
  step: '0.01',
  default: '1',
} as const

/**
 * The limit price of a Lighter market trigger order (Lighter's `price`):
 * `triggerPrice` moved `slippagePercent` against the order, then snapped to
 * `priceDecimals` down for a sell and up for a buy, so the bound is never
 * tighter than the percent.
 *
 * @throws {PerpsError} `ValidationError` when `market.priceDecimals` is
 *   absent, `slippagePercent` is outside {@link LIGHTER_MARKET_SLIPPAGE_PERCENT},
 *   or an input does not match the decimal pattern.
 * @public
 */
export function slippageAdjustedLimitPrice(
  market: Market,
  { triggerPrice, side, slippagePercent }: SlippageAdjustedLimitPriceParams
): DecimalString {
  if (market.priceDecimals === undefined) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Market '${market.id}' carries no priceDecimals; the Lighter ` +
        `slippage-adjusted limit price cannot be snapped without the ` +
        `market's tick grid.`
    )
  }
  const { min, max } = LIGHTER_MARKET_SLIPPAGE_PERCENT
  if (
    compareDecimalStrings(slippagePercent, min) < 0 ||
    compareDecimalStrings(slippagePercent, max) > 0
  ) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid \`slippagePercent\`: ${slippagePercent}. Lighter takes ` +
        `${min} to ${max}.`
    )
  }
  const slippage = multiplyDecimalString(slippagePercent, '0.01')
  const isSell = side === OrderSide.SELL
  const factor = isSell
    ? subtractDecimalString('1', slippage)
    : addDecimalString('1', slippage)
  return roundDecimalString(
    multiplyDecimalString(triggerPrice, factor),
    market.priceDecimals,
    isSell ? 'truncate' : 'up'
  )
}

/**
 * Snap a price onto a Lighter market's tick grid: rounded half-up to the
 * market's `priceDecimals` (Lighter's `supported_price_decimals`), trailing
 * zeros stripped.
 *
 * @throws {PerpsError} `ValidationError` when `market.priceDecimals` is
 *   absent — without the venue's tick grid no correct price can be produced.
 * @public
 */
export function snapOrderPrice(
  market: Market,
  price: DecimalString
): DecimalString {
  if (market.priceDecimals === undefined) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Market '${market.id}' carries no priceDecimals; Lighter order prices ` +
        `cannot be snapped without the market's tick grid.`
    )
  }
  const rounded = new Big(price).round(market.priceDecimals, Big.roundHalfUp)
  return rounded.eq(0) ? '0' : rounded.toFixed()
}

/**
 * Snap a size onto a Lighter market's lot grid: truncated toward zero (never
 * rounded up, so the size cannot exceed the user's balance) to the market's
 * `szDecimals` (Lighter's `supported_size_decimals`), trailing zeros stripped.
 *
 * @param size - Size in base-asset units as a non-negative magnitude.
 * @public
 */
export function snapOrderSize(
  market: Market,
  size: DecimalString
): DecimalString {
  const truncated = new Big(size).round(market.szDecimals, Big.roundDown)
  return truncated.eq(0) ? '0' : truncated.toFixed()
}
