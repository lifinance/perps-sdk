import type { FeeTier, OrderbookResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  ProviderGetQuoteParams,
  QuoteListener,
} from '../types/provider.js'
import { buildQuote } from '../utils/calculations.js'
import type { WsProvider } from '../websocket/types.js'
import { resolveQuoteMarket, resolveQuotePrice } from './resolveQuote.js'

/**
 * Minimum gap between successive streamed {@link Quote} emissions — the same
 * 100 ms pacing applied to streamed orderbook rendering, so a quote ticks no
 * faster than the book it derives from.
 *
 * @public
 */
export const QUOTE_THROTTLE_MS = 100

/**
 * Shared provider-side `subscribeQuote` implementation: resolve
 * `params.symbol` to a market on `provider` (via {@link resolveQuoteMarket}),
 * subscribe to that market's orderbook channel on `ws`, and on each book
 * update rebuild the {@link Quote} with the provider's public base `feeTier` —
 * the same transform the one-shot `resolveQuote` applies to a REST snapshot.
 * Emissions are throttled to {@link QUOTE_THROTTLE_MS}: the first book update
 * emits immediately, then at most one (trailing, latest-book) emission per
 * interval. Both venue WS plugins delegate here; each only supplies its own
 * base tier.
 *
 * The returned unsubscribe is idempotent — it releases the underlying
 * orderbook listener once and cancels any pending trailing emission, so the
 * wire subscription's ref count cannot be double-decremented.
 *
 * @throws {PerpsError} `MarketNotFound` when no market matches symbol+type.
 * @internal
 */
export async function resolveSubscribeQuote(
  client: PerpsSDKClient,
  provider: string,
  ws: Pick<WsProvider, 'subscribe'>,
  params: ProviderGetQuoteParams,
  feeTier: FeeTier,
  onQuote: QuoteListener
): Promise<() => void> {
  const market = await resolveQuoteMarket(client, provider, params)
  const price = await resolveQuotePrice(client, provider, market.id)

  let latestBook: OrderbookResponse | undefined
  let lastEmitAt = Number.NEGATIVE_INFINITY
  let trailing: ReturnType<typeof setTimeout> | undefined

  const emit = () => {
    if (latestBook === undefined) {
      return
    }
    lastEmitAt = Date.now()
    onQuote(
      buildQuote({
        provider,
        symbol: params.symbol,
        type: params.type,
        side: params.side,
        sizeUsd: params.size,
        market,
        price,
        bids: latestBook.bids,
        asks: latestBook.asks,
        feeTier,
        timestamp: Date.now(),
      })
    )
  }

  const unsubscribe = await ws.subscribe(
    { channel: 'orderbook', dex: provider, marketId: market.id },
    (event) => {
      if (event.channel !== 'orderbook') {
        return
      }
      latestBook = event.data
      if (trailing !== undefined) {
        return
      }
      const wait = QUOTE_THROTTLE_MS - (Date.now() - lastEmitAt)
      if (wait <= 0) {
        emit()
      } else {
        trailing = setTimeout(() => {
          trailing = undefined
          emit()
        }, wait)
      }
    }
  )

  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    if (trailing !== undefined) {
      clearTimeout(trailing)
      trailing = undefined
    }
    unsubscribe()
  }
}
