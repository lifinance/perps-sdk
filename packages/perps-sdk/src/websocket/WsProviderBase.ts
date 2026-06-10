import type { Subscription, SubscriptionEvent } from '@lifi/perps-types'
import type { ReconnectingWebSocket } from './ReconnectingWebSocket.js'
import type {
  SubscriptionListener,
  WsProvider,
  WsStatusListener,
} from './types.js'

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
 * ReconnectingWebSocket} and the fan-out lifecycle — ref-counted multi-listener
 * subscription per channel key, deferred teardown, status fan-out — so any
 * number of consumers (and StrictMode double-mounts) collapse to exactly one
 * wire subscribe/unsubscribe per key. Subclasses own everything wire-specific
 * via {@link WsProviderBase.openChannel}, {@link WsProviderBase.onOpen} and
 * {@link WsProviderBase.handleMessage}: payload framing, frame validation,
 * dispatch, and resubscribe-on-open.
 *
 * @public
 */
export abstract class WsProviderBase implements WsProvider {
  protected readonly rws: ReconnectingWebSocket
  protected readonly providerKey: string

  private readonly channels = new Map<string, ChannelEntry>()
  private readonly statusListeners = new Map<WsStatusListener, number>()

  constructor(rws: ReconnectingWebSocket, providerKey: string) {
    this.providerKey = providerKey
    this.rws = rws
    this.rws.on('message', (data) => this.handleMessage(data))
    this.rws.on('open', () => {
      void this.onOpen()
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

  /** Canonical fan-out key for `sub`; must match the key the subclass emits to. */
  protected abstract toKey(sub: Subscription): string

  /**
   * Open the channel on the wire (0→1 transition only). Record the sub for
   * resubscribe, send the subscribe frame(s) only while connected, and return a
   * closure that removes the sub and sends the unsubscribe frame(s).
   */
  protected abstract openChannel(sub: Subscription): Promise<() => void>

  /** Socket (re)opened: replay every recorded sub. */
  protected abstract onOpen(): void | Promise<void>

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
