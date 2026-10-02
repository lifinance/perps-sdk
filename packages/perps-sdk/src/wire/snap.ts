import type { DecimalString, Market } from '@lifi/perps-types'
import { requireProvider } from '../client/requireProvider.js'
import type { PerpsSDKClient } from '../types/provider.js'

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
