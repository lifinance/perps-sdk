import type { Subscription, SubscriptionEvent } from '@lifi/perps-types'
import type {
  ProviderGetQuoteParams,
  QuoteListener,
} from '../types/provider.js'

/**
 * The concrete {@link SubscriptionEvent} variant a given subscription `S`
 * emits, narrowed by its `channel`.
 *
 * @public
 */
export type EventForSubscription<S extends Subscription> = Extract<
  SubscriptionEvent,
  { channel: S['channel'] }
>

/**
 * Listener invoked with each realtime {@link SubscriptionEvent}.
 *
 * @public
 */
export type SubscriptionListener = (event: SubscriptionEvent) => void

/**
 * Health of a provider's underlying WS connection.
 *
 * - `connected` — socket open, live data flowing.
 * - `reconnecting` — socket dropped; auto-reconnect with backoff in progress.
 *   Data may be stale until it returns to `connected`.
 * - `disconnected` — reconnection abandoned after the retry cap, or the
 *   connection was explicitly closed. The connection is permanently dead and
 *   will not recover on its own; the subscription's data is stale. Terminal.
 *
 * @public
 */
export type WsConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'

/**
 * Listener invoked when the underlying WS connection's health changes.
 *
 * @public
 */
export type WsStatusListener = (status: WsConnectionStatus) => void

/**
 * Per-provider realtime transport contract used by {@link PerpsWsClient}.
 * Implemented by the provider packages' WS plugins.
 *
 * @public
 */
export interface WsProvider {
  /**
   * Subscribe to one venue channel and return an idempotent unsubscribe.
   * `onStatus` receives the provider socket's health transitions.
   */
  subscribe(
    sub: Subscription,
    listener: SubscriptionListener,
    onStatus?: WsStatusListener
  ): Promise<() => void>
  /**
   * Recover a terminally exhausted connection. Safe no-op unless status is
   * `disconnected`.
   */
  reconnect(): void
  /**
   * Stream live fill {@link Quote}s for `params.size` USD notional of
   * `params.symbol` on this venue, layered on the orderbook channel: the
   * provider resolves the symbol against its own markets and re-runs the
   * one-shot quote transform on each (throttled) book update, applying its
   * public base fee tier. Returns an idempotent unsubscribe.
   */
  subscribeQuote(
    params: ProviderGetQuoteParams,
    onQuote: QuoteListener
  ): Promise<() => void>
  /** Permanently close the provider's realtime connection. */
  close(): void
}
