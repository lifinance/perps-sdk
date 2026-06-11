import type { Subscription, SubscriptionEvent } from '@lifi/perps-types'
import type {
  ProviderGetQuoteParams,
  QuoteListener,
} from '../types/provider.js'
import type { ReconnectingWebSocket } from './ReconnectingWebSocket.js'
import type {
  SubscriptionListener,
  WsProvider,
  WsStatusListener,
} from './types.js'
import { wsLog } from './wsLog.js'

/**
 * Linger before tearing a channel off the wire after its last listener
 * releases. A re-subscribe to the same key within this window cancels the
 * pending teardown, so React StrictMode's synchronous unmount→remount (ref
 * count 1→0→1) and fast route flips collapse to one wire subscription rather
 * than a subscribe→unsubscribe→subscribe churn the venue would reject.
 *
 * @public
 */
export const WS_CHANNEL_TEARDOWN_LINGER_MS = 250

interface ChannelEntry {
  /**
   * Per-listener ref count — a `Map`, not a `Set`, because the same listener
   * reference may subscribe twice (StrictMode) and only the matching number of
   * releases may drop it; a `Set` would lose it on the first sibling release.
   */
  listeners: Map<SubscriptionListener, number>
  /** Wire teardown from {@link WsProviderBase.openChannel}, set once the open resolves. */
  teardown?: () => void
  /** In-flight open, set on the 0→1 transition so concurrent subscribes share it. */
  opening?: Promise<() => void>
  /** Deferred-teardown timer, set on the 1→0 transition; cleared if re-subscribed within the linger. */
  pendingTeardown?: ReturnType<typeof setTimeout>
}

/**
 * Base for per-provider realtime transports. Owns the {@link
 * ReconnectingWebSocket}, the fan-out lifecycle — ref-counted multi-listener
 * subscription per channel key, deferred teardown, status fan-out — so any
 * number of consumers (and StrictMode double-mounts) collapse to exactly one
 * wire subscribe/unsubscribe per key, and the wire-subscription registry:
 * subs recorded via {@link WsProviderBase.registerSub} are sent only while
 * connected and replayed (failure-isolated) on every (re)open. Subclasses own
 * everything wire-specific via {@link WsProviderBase.openChannel}, {@link
 * WsProviderBase.sendSubscribe} and {@link WsProviderBase.handleMessage}:
 * payload framing, frame validation and dispatch.
 *
 * `TSub` is the per-subscription state {@link WsProviderBase.sendSubscribe}
 * needs to (re)build one subscribe frame.
 *
 * @public
 */
export abstract class WsProviderBase<TSub = unknown> implements WsProvider {
  protected readonly rws: ReconnectingWebSocket
  protected readonly providerKey: string

  private readonly channels = new Map<string, ChannelEntry>()
  private readonly statusListeners = new Map<WsStatusListener, number>()
  private readonly wireSubs = new Map<string, TSub>()

  constructor(rws: ReconnectingWebSocket, providerKey: string) {
    this.providerKey = providerKey
    this.rws = rws
    this.rws.on('message', (data) => this.handleMessage(data))
    this.rws.on('open', () => {
      void this.replaySubs()
    })
    this.rws.onStatus((status) => {
      for (const fn of this.statusListeners.keys()) {
        fn(status)
      }
    })
  }

  async subscribe(
    sub: Subscription,
    listener: SubscriptionListener,
    onStatus?: WsStatusListener
  ): Promise<() => void> {
    const key = this.toKey(sub)
    await this.acquireChannel(key, sub, listener)

    if (onStatus) {
      this.statusListeners.set(
        onStatus,
        (this.statusListeners.get(onStatus) ?? 0) + 1
      )
      onStatus(this.rws.getStatus())
    }

    return () => {
      if (onStatus) {
        const remaining = (this.statusListeners.get(onStatus) ?? 0) - 1
        if (remaining > 0) {
          this.statusListeners.set(onStatus, remaining)
        } else {
          this.statusListeners.delete(onStatus)
        }
      }
      this.releaseChannel(key, listener)
    }
  }

  close(): void {
    for (const entry of this.channels.values()) {
      if (entry.pendingTeardown !== undefined) {
        clearTimeout(entry.pendingTeardown)
      }
    }
    this.onClose()
    this.rws.close()
    this.channels.clear()
    this.statusListeners.clear()
    this.wireSubs.clear()
  }

  /** Deliver an event to every listener on `key`. */
  protected emit(key: string, event: SubscriptionEvent): void {
    const entry = this.channels.get(key)
    if (entry === undefined) {
      return
    }
    for (const fn of entry.listeners.keys()) {
      fn(event)
    }
  }

  /**
   * Tear `key` off the wire immediately if no listener holds it — i.e. it is
   * lingering in the deferred-teardown window (or its open is still
   * unwinding). Returns `true` when the key is free (absent or just torn
   * down), `false` — leaving the channel untouched — while live listeners
   * hold it. Lets a subclass that enforces an exclusivity invariant across
   * keys reclaim a released channel without waiting out the linger.
   */
  protected closeChannelIfIdle(key: string): boolean {
    const entry = this.channels.get(key)
    if (entry === undefined) {
      return true
    }
    if (entry.listeners.size > 0) {
      return false
    }
    if (entry.pendingTeardown !== undefined) {
      clearTimeout(entry.pendingTeardown)
    }
    entry.teardown?.()
    this.channels.delete(key)
    return true
  }

  /**
   * Record a wire subscription for replay-on-(re)open and, when the socket is
   * already connected, send its subscribe frame via {@link sendSubscribe}.
   * While the socket is down the replay loop on the next open is the sole
   * sender — sending in both places would double-subscribe. A failed send
   * removes the sub again so a rejected open leaves no registry entry behind.
   */
  protected async registerSub(key: string, state: TSub): Promise<void> {
    this.wireSubs.set(key, state)
    if (this.rws.getStatus() !== 'connected') {
      return
    }
    try {
      await this.sendSubscribe(state)
    } catch (err) {
      this.wireSubs.delete(key)
      throw err
    }
  }

  /** Forget a wire subscription so the next (re)open no longer replays it. */
  protected unregisterSub(key: string): void {
    this.wireSubs.delete(key)
  }

  private async replaySubs(): Promise<void> {
    for (const [key, state] of this.wireSubs) {
      // Isolate each resubscribe: a send can reject (e.g. an auth-token fetch
      // after reconnect), and one sub's failure must not abort the rest of
      // the loop or escape as an unhandled rejection.
      try {
        await this.sendSubscribe(state)
      } catch (err) {
        wsLog.subscribeFailure(this.providerKey, key, err)
      }
    }
  }

  /** Venue-specific {@link WsProvider.subscribeQuote}; see `resolveSubscribeQuote`. */
  abstract subscribeQuote(
    params: ProviderGetQuoteParams,
    onQuote: QuoteListener
  ): Promise<() => void>

  /** Canonical fan-out key for `sub`; must match the key the subclass emits to. */
  protected abstract toKey(sub: Subscription): string

  /**
   * Open the channel on the wire (0→1 transition only). Record the wire
   * sub(s) via {@link registerSub} and return a closure that unregisters them
   * and sends the unsubscribe frame(s).
   */
  protected abstract openChannel(sub: Subscription): Promise<() => void>

  /**
   * Encode and send the subscribe frame for one registered sub. Called by the
   * base while connected — once on register and again on every (re)open — so
   * it must be safe to invoke repeatedly with the same state (e.g. re-fetch a
   * fresh auth token per call rather than embedding one in `state`).
   */
  protected abstract sendSubscribe(state: TSub): void | Promise<void>

  /** Parse one inbound frame and route it via {@link emit}. */
  protected abstract handleMessage(raw: string): void

  /** Release subclass-only resources on {@link close} (keep-alive, cached state). */
  protected onClose(): void {}

  private async acquireChannel(
    key: string,
    sub: Subscription,
    listener: SubscriptionListener
  ): Promise<void> {
    let entry = this.channels.get(key)
    if (entry === undefined) {
      entry = { listeners: new Map() }
      this.channels.set(key, entry)
    }

    // Register first (ref-counted) so a frame arriving during an in-flight open
    // is delivered; cancel any pending teardown (re-subscribe within the linger).
    entry.listeners.set(listener, (entry.listeners.get(listener) ?? 0) + 1)
    if (entry.pendingTeardown !== undefined) {
      clearTimeout(entry.pendingTeardown)
      entry.pendingTeardown = undefined
    }

    if (entry.teardown !== undefined) {
      return
    }
    if (entry.opening !== undefined) {
      await entry.opening
      return
    }

    const opening = this.openChannel(sub)
    entry.opening = opening
    try {
      const teardown = await opening
      const current = this.channels.get(key)
      if (current === undefined || current.listeners.size === 0) {
        // Every listener released while opening — unwind immediately.
        teardown()
        this.channels.delete(key)
        return
      }
      current.teardown = teardown
      current.opening = undefined
    } catch (err) {
      // Open failed: drop the channel so all (concurrent) subscribers reject
      // cleanly and a later subscribe re-opens.
      this.channels.delete(key)
      throw err
    }
  }

  private releaseChannel(key: string, listener: SubscriptionListener): void {
    const entry = this.channels.get(key)
    if (entry === undefined) {
      return
    }

    const remaining = (entry.listeners.get(listener) ?? 0) - 1
    if (remaining > 0) {
      entry.listeners.set(listener, remaining)
      return
    }
    entry.listeners.delete(listener)
    if (entry.listeners.size > 0) {
      return
    }

    if (entry.teardown === undefined) {
      // Open not resolved yet — acquireChannel's post-open check unwinds it.
      if (entry.opening === undefined) {
        this.channels.delete(key)
      }
      return
    }

    if (entry.pendingTeardown !== undefined) {
      return
    }
    entry.pendingTeardown = setTimeout(() => {
      const e = this.channels.get(key)
      if (e === undefined) {
        return
      }
      if (e.listeners.size > 0) {
        e.pendingTeardown = undefined
        return
      }
      e.teardown?.()
      this.channels.delete(key)
    }, WS_CHANNEL_TEARDOWN_LINGER_MS)
  }
}
