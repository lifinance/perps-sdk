import type { Subscription, SubscriptionEvent } from '@lifi/perps-types'

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
 * - `disconnected` — reconnection abandoned after the retry cap. The
 *   connection is permanently dead and will not recover on its own; the
 *   subscription's data is stale. Terminal.
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
  subscribe(
    sub: Subscription,
    listener: SubscriptionListener,
    onStatus?: WsStatusListener
  ): Promise<() => void>
  close(): void
}
