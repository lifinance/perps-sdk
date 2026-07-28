import type { Quote, QuoteSide, TradeType } from '@lifi/perps-types'
import { requireProvider } from '../client/requireProvider.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getQuote}.
 *
 * @public
 */
export interface GetQuoteParams {
  /** Provider key whose orderbook supplies the quote. */
  provider: string
  /** Human `displaySymbol`, e.g. `"BTC"`, resolved by the provider. */
  symbol: string
  /** Buy consumes asks; sell consumes bids. */
  side: QuoteSide
  /** USD notional to fill. */
  size: number
  /** Product family used to distinguish spot and perpetual markets. */
  type: TradeType
}

/**
 * Get a one-shot fill quote for `size` USD notional of `symbol` on a single
 * venue: VWAP expected fill, price impact (bps), base-tier taker fee, and
 * funding (perps only). Delegates to the registered venue plugin, which
 * resolves the symbol against its own markets (scoped by `type`) and walks its
 * orderbook. Cross-venue comparison is a consumer-side loop over
 * `client.providers`.
 *
 * @throws {PerpsError} When the provider plugin is not registered, no market
 *   matches the symbol+type, or on network / parsing errors.
 * @example
 * ```ts
 * const quote = await getQuote(client, {
 *   provider: 'hyperliquid',
 *   symbol: 'BTC',
 *   side: 'buy',
 *   size: 10_000,
 *   type: 'perps',
 * })
 * console.log(quote.expectedFillPrice, quote.priceImpactBps)
 * ```
 * @public
 */
export async function getQuote(
  client: PerpsSDKClient,
  params: GetQuoteParams,
  options?: SDKRequestOptions
): Promise<Quote> {
  return requireProvider(client, params.provider).getQuote(
    {
      symbol: params.symbol,
      side: params.side,
      size: params.size,
      type: params.type,
    },
    options
  )
}
