import {
  type FeeTier,
  type MarketContext,
  type OrderbookResponse,
  PerpsErrorCode,
} from '@lifi/perps-types'
import { isDecimalString } from '../decimal/parse.js'
import { PerpsError } from '../errors/PerpsError.js'
import { buildQuote } from '../math/order.js'
import type {
  PerpsSDKClient,
  ProviderGetQuoteParams,
  QuoteListener,
} from '../types/provider.js'
import type { WsProvider } from '../websocket/types.js'
import { wsLog } from '../websocket/wsLog.js'
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
 * subscribe to that market's orderbook and marketContext channels on `ws`,
 * and on each book update rebuild the {@link Quote} against the latest
 * {@link MarketContext} with the provider's public base `feeTier` — the same
 * transform the one-shot `resolveQuote` applies to a REST snapshot. Emissions
 * are throttled to {@link QUOTE_THROTTLE_MS}: the first book update emits
 * immediately, then at most one (trailing, latest-book) emission per
 * interval. Both venue WS plugins delegate here; each only supplies its own
 * base tier.
 *
 * The returned unsubscribe is idempotent — it releases both underlying
 * listeners once and cancels any pending trailing emission, so the wire
 * subscriptions' ref counts cannot be double-decremented.
 *
 * A throw while building or delivering a streamed quote (an unparsable mark
 * price, a throwing `onQuote`) is logged via `wsLog.listenerFailure` and the
 * emission is skipped, on both the immediate and the trailing-timer path.
 *
 * @throws {PerpsError} `ValidationError` when `params.size` does not match the decimal pattern.
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
  if (!isDecimalString(params.size)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Quote size must be a decimal string, got '${params.size}'`
    )
  }
  const market = await resolveQuoteMarket(client, provider, params)
  // REST snapshot seeds the context; the marketContext subscription below
  // keeps it live so streamed impact/funding track the moving market.
  let latestContext: MarketContext = await resolveQuotePrice(
    client,
    provider,
    market.id
  )

  let latestBook: OrderbookResponse | undefined
  let lastEmitAt = Number.NEGATIVE_INFINITY
  let trailing: ReturnType<typeof setTimeout> | undefined

  const emit = () => {
    if (latestBook === undefined) {
      return
    }
    lastEmitAt = Date.now()
    try {
      onQuote(
        buildQuote({
          provider,
          symbol: params.symbol,
          type: params.type,
          side: params.side,
          sizeUsd: params.size,
          market,
          price: latestContext,
          bids: latestBook.bids,
          asks: latestBook.asks,
          feeTier,
          timestamp: Date.now(),
        })
      )
    } catch (error) {
      wsLog.listenerFailure(provider, 'quote', error)
    }
  }

  const unsubscribeContext = await ws.subscribe(
    { channel: 'marketContext', dex: provider, marketId: market.id },
    (event) => {
      if (event.channel !== 'marketContext') {
        return
      }
      latestContext = event.data
    }
  )

  let unsubscribeBook: () => void
  try {
    unsubscribeBook = await ws.subscribe(
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
  } catch (error) {
    unsubscribeContext()
    throw error
  }

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
    unsubscribeContext()
    unsubscribeBook()
  }
}
