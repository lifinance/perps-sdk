import type { Subscription, SubscriptionEvent } from '@lifi/perps-types'

export type EventForSubscription<S extends Subscription> = Extract<
  SubscriptionEvent,
  { channel: S['channel'] }
>

export type SubscriptionListener = (event: SubscriptionEvent) => void

export interface WsProvider {
  subscribe(
    sub: Subscription,
    listener: SubscriptionListener
  ): Promise<() => void>
  close(): void
}
