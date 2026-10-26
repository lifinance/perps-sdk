import {
  type DecimalString,
  type Market,
  PerpsErrorCode,
} from '@lifi/perps-types'
import { requireProvider } from '../client/requireProvider.js'
import { PerpsError } from '../errors/PerpsError.js'
import type {
  PerpsSDKClient,
  SlippageAdjustedLimitPriceParams,
} from '../types/provider.js'
import { createWarnOnce } from '../utils/warnOnce.js'

const warnSnapOrderPriceFailureOnce = createWarnOnce()

/**
 * Snap `size` onto the lot grid of `market`'s venue, truncating toward zero,
 * through the market's own provider. Takes and gives a {@link DecimalString},
 * so a caller never converts an order size to a `number`.
 *
 * @throws {PerpsError} `SDKError` when `market.providerId` names no registered
 *   provider plugin.
 * @public
 */
export function snapOrderSize(
  sdk: PerpsSDKClient,
  market: Market,
  size: DecimalString
): DecimalString {
  return requireProvider(sdk, market.providerId).snapOrderSize(market, size)
}

/**
 * Snap `price` onto the tick grid of `market`'s venue, rounding half-up,
 * through the market's own provider. Takes and gives a {@link DecimalString},
 * so a caller never converts an order price to a `number`.
 *
 * @throws {PerpsError} `SDKError` when `market.providerId` names no registered
 *   provider plugin, or `ValidationError` when the market lacks the tick
 *   metadata the venue's rules need.
 * @public
 */
export function snapOrderPrice(
  sdk: PerpsSDKClient,
  market: Market,
  price: DecimalString
): DecimalString {
  return requireProvider(sdk, market.providerId).snapOrderPrice(market, price)
}

/**
 * {@link snapOrderPrice}, or `undefined` where it throws. A display calls it
 * on each render, so it writes one warning per market, not one per call.
 *
 * @public
 */
export function safeSnapOrderPrice(
  sdk: PerpsSDKClient,
  market: Market,
  price: DecimalString
): DecimalString | undefined {
  try {
    return snapOrderPrice(sdk, market, price)
  } catch (error) {
    warnSnapOrderPriceFailureOnce(
      `${market.providerId}|${market.id}`,
      `[perps-sdk] snapOrderPrice failed on market '${market.id}' (${market.providerId}): ${error instanceof Error ? error.message : String(error)}`
    )
    return undefined
  }
}

/**
 * The slippage-adjusted limit price of a market trigger order on `market`,
 * through the market's own provider: the worst fill that
 * `params.slippagePercent` from `params.triggerPrice` allows, on the venue
 * tick grid.
 *
 * @throws {PerpsError} `SDKError` when `market.providerId` names no registered
 *   provider plugin, or `ValidationError` when the provider takes no
 *   slippage-adjusted limit price or rejects the inputs.
 * @public
 */
export function calculateSlippageAdjustedLimitPrice(
  sdk: PerpsSDKClient,
  market: Market,
  params: SlippageAdjustedLimitPriceParams
): DecimalString {
  const marketSlippage = requireProvider(sdk, market.providerId).triggerOrders
    ?.marketSlippage
  if (marketSlippage === undefined) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Provider '${market.providerId}' takes no slippage-adjusted limit price ` +
        `for a market trigger order.`
    )
  }
  return marketSlippage.slippageAdjustedLimitPrice(market, params)
}
