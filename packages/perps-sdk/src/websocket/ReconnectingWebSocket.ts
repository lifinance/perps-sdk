import type {
  CloseEvent as PartySocketCloseEvent,
  ErrorEvent as PartySocketErrorEvent,
} from 'partysocket/ws'
import PartySocketWebSocket from 'partysocket/ws'
import type { WsConnectionStatus, WsStatusListener } from './types.js'
import { wsLog } from './wsLog.js'

type WsEventMap = {
  open: () => void
  close: (code: number, reason: string) => void
  error: (error: Event) => void
  message: (data: string) => void
}

type WsEvent = keyof WsEventMap

/**
 * Default reconnect attempt cap. With the jittered backoff below, ten attempts
 * span roughly 20–60s of retries before the socket is declared `disconnected`
 * — long enough for a live trading feed to ride out a transient network blip.
 */
const DEFAULT_MAX_RETRIES = 10

/** Default watchdog window: three keepalive intervals without inbound traffic. */
const DEFAULT_STALE_WINDOW_PING_INTERVALS = 3

const CONNECTION_TIMEOUT_MS = 4_000
/** Uptime below which an open does not reset the retry budget, so an accept-then-drop server still exhausts. */
const MIN_UPTIME_MS = 5_000
const MAX_ENQUEUED_MESSAGES = 1_000
/** First-retry delay is drawn once per socket from [500, 1500)ms to de-synchronize reconnect storms. */
const MIN_RECONNECTION_DELAY_MS = 500
const RECONNECTION_JITTER_MS = 1_000
const MAX_RECONNECTION_DELAY_MS = 10_000

const CLOSED_ERROR = 'WebSocket closed'
const EXHAUSTED_ERROR = 'WebSocket max reconnect attempts reached'
const WS_PROVIDER_KEY = 'reconnecting-websocket'

/**
 * Options for {@link ReconnectingWebSocket}.
 *
 * @public
 */
export interface ReconnectingWebSocketOptions {
  /** Maximum reconnect attempts before status becomes `disconnected`; defaults to 10. */
  maxRetries?: number
  /** Keepalive interval in milliseconds; defaults to 30,000. */
  pingIntervalMs?: number
  /**
   * Keepalive frame sent every `pingIntervalMs` while the socket is open.
   * Framing is venue-specific, so when omitted no keepalive is sent.
   */
  pingPayload?: string
  /**
   * Stale-stream watchdog window in milliseconds. With `pingPayload` configured,
   * the socket is force-reconnected when no inbound frame arrives within this
   * window. Defaults to 3× `pingIntervalMs`.
   */
  staleWindowMs?: number
}

/**
 * A `WebSocket` transport that auto-reconnects with jittered exponential
 * backoff (`partysocket` internals), buffers sends (bounded) while
 * disconnected, keepalive-pings with the caller-supplied `pingPayload`, and
 * force-reconnects a silently stale stream. Surfaces the
 * {@link WsConnectionStatus} state machine: `reconnecting` on transient drops,
 * terminal `disconnected` once the retry budget is exhausted.
 *
 * @public
 */
export class ReconnectingWebSocket {
  private readonly socket: PartySocketWebSocket
  private readonly maxRetries: number
  private readonly pingIntervalMs: number
  private readonly pingPayload: string | undefined
  private readonly staleWindowMs: number
  private closed = false
  private reconnectRequested = false
  private lastCloseRetryCount: number
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private staleTimer: ReturnType<typeof setTimeout> | null = null
  private listeners = {
    open: new Set<WsEventMap['open']>(),
    close: new Set<WsEventMap['close']>(),
    error: new Set<WsEventMap['error']>(),
    message: new Set<WsEventMap['message']>(),
  }
  private statusListeners = new Set<WsStatusListener>()
  private status: WsConnectionStatus = 'reconnecting'
  private readyResolvers: Array<{
    resolve: () => void
    reject: (e: Error) => void
  }> = []

  constructor(url: string, options?: ReconnectingWebSocketOptions) {
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES
    this.pingIntervalMs = options?.pingIntervalMs ?? 30_000
    this.pingPayload = options?.pingPayload
    this.staleWindowMs =
      options?.staleWindowMs ??
      this.pingIntervalMs * DEFAULT_STALE_WINDOW_PING_INTERVALS
    this.socket = new PartySocketWebSocket(url, undefined, {
      maxRetries: this.maxRetries,
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      minUptime: MIN_UPTIME_MS,
      maxEnqueuedMessages: MAX_ENQUEUED_MESSAGES,
      minReconnectionDelay:
        MIN_RECONNECTION_DELAY_MS + Math.random() * RECONNECTION_JITTER_MS,
      maxReconnectionDelay: MAX_RECONNECTION_DELAY_MS,
    })
    this.lastCloseRetryCount = this.socket.retryCount
    // The onX handlers receive the raw events; addEventListener would hand out
    // partysocket's clones, which rewrite an empty close reason in Node.
    this.socket.onopen = this.handleOpen
    this.socket.onclose = this.handleClose
    this.socket.onerror = this.handleError
    this.socket.onmessage = this.handleMessage
  }

  private handleOpen = () => {
    this.startPing()
    this.armWatchdog()
    this.setStatus('connected')
    for (const fn of this.listeners.open) {
      this.callListener('open', fn)
    }
    for (const { resolve } of this.readyResolvers) {
      resolve()
    }
    this.readyResolvers = []
  }

  private handleClose = (event: PartySocketCloseEvent) => {
    this.stopPing()
    this.clearWatchdog()
    if (this.closed) {
      return
    }
    for (const fn of this.listeners.close) {
      this.callListener('close', fn, event.code, event.reason)
    }
    // partysocket schedules the next attempt — incrementing retryCount —
    // before dispatching close, and exhausts silently: a retryCount at the cap
    // that did not move since the previous close means no attempt was
    // scheduled, i.e. the retry budget is spent.
    const retryCount = this.socket.retryCount
    const exhausted =
      !this.reconnectRequested &&
      retryCount >= this.maxRetries &&
      retryCount === this.lastCloseRetryCount
    this.lastCloseRetryCount = retryCount
    if (exhausted) {
      for (const { reject } of this.readyResolvers) {
        reject(new Error(EXHAUSTED_ERROR))
      }
      this.readyResolvers = []
      this.setStatus('disconnected')
    } else {
      this.setStatus('reconnecting')
    }
  }

  private handleError = (event: PartySocketErrorEvent) => {
    for (const fn of this.listeners.error) {
      this.callListener('error', fn, event)
    }
  }

  private handleMessage = (event: MessageEvent) => {
    this.armWatchdog()
    const data =
      typeof event.data === 'string' ? event.data : String(event.data)
    for (const fn of this.listeners.message) {
      this.callListener('message', fn, data)
    }
  }

  private setStatus(status: WsConnectionStatus) {
    if (this.status === status) {
      return
    }
    this.status = status
    for (const fn of this.statusListeners) {
      this.callListener('status', fn, status)
    }
  }

  private callListener<TArgs extends unknown[]>(
    listenerType: string,
    listener: (...args: TArgs) => void,
    ...args: TArgs
  ) {
    try {
      listener(...args)
    } catch (error) {
      wsLog.listenerFailure(WS_PROVIDER_KEY, listenerType, error)
    }
  }

  private startPing() {
    const payload = this.pingPayload
    if (payload === undefined) {
      return
    }
    this.pingTimer = setInterval(() => {
      if (this.socket.readyState === PartySocketWebSocket.OPEN) {
        this.socket.send(payload)
      }
    }, this.pingIntervalMs)
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private armWatchdog() {
    if (this.pingPayload === undefined || this.closed) {
      return
    }
    this.clearWatchdog()
    this.staleTimer = setTimeout(() => {
      // The keepalive went unanswered for the whole window: the connection is
      // half-open and serving stale data — tear it down and reconnect.
      this.reconnect()
    }, this.staleWindowMs)
  }

  private clearWatchdog() {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer)
      this.staleTimer = null
    }
  }

  /**
   * Send `data`, buffering it (bounded) for replay when the socket is not yet
   * open. Throws once {@link ReconnectingWebSocket.close} has been called —
   * there is no socket left to buffer against.
   *
   * @public
   */
  send(data: string) {
    if (this.closed) {
      throw new Error(CLOSED_ERROR)
    }
    this.socket.send(data)
  }

  /**
   * Permanently close the socket, suppress further reconnection, and set
   * status to terminal `disconnected`.
   *
   * @public
   */
  close() {
    this.closed = true
    this.stopPing()
    this.clearWatchdog()
    this.socket.close()
    this.setStatus('disconnected')
    for (const { reject } of this.readyResolvers) {
      reject(new Error(CLOSED_ERROR))
    }
    this.readyResolvers = []
  }

  /**
   * Drop the current connection (if any) and reconnect with a fresh retry
   * budget. Recovers a socket that reached terminal `disconnected`: status
   * returns to `reconnecting` and the normal backoff cycle restarts.
   *
   * @public
   */
  reconnect() {
    this.closed = false
    // Suppress the exhaustion check for the synchronous teardown close the
    // underlying reconnect dispatches — a fresh attempt is always scheduled.
    this.reconnectRequested = true
    this.socket.reconnect()
    this.reconnectRequested = false
    this.lastCloseRetryCount = this.socket.retryCount
    this.setStatus('reconnecting')
  }

  /**
   * Register a listener for a socket lifecycle event.
   *
   * @public
   */
  on<E extends WsEvent>(event: E, fn: WsEventMap[E]) {
    ;(this.listeners[event] as Set<WsEventMap[E]>).add(fn)
  }

  /**
   * Remove a previously registered lifecycle-event listener.
   *
   * @public
   */
  off<E extends WsEvent>(event: E, fn: WsEventMap[E]) {
    ;(this.listeners[event] as Set<WsEventMap[E]>).delete(fn)
  }

  /**
   * Current connection health. `reconnecting` until the first open;
   * `disconnected` once auto-reconnect is abandoned or {@link
   * ReconnectingWebSocket.close} is called (terminal until {@link
   * ReconnectingWebSocket.reconnect} is called).
   *
   * @public
   */
  getStatus(): WsConnectionStatus {
    return this.status
  }

  /**
   * Register a connection-health listener. Fires on every status transition,
   * including the terminal `disconnected` emitted on reconnect exhaustion.
   *
   * @public
   */
  onStatus(fn: WsStatusListener) {
    this.statusListeners.add(fn)
  }

  /**
   * Remove a previously registered connection-health listener.
   *
   * @public
   */
  offStatus(fn: WsStatusListener) {
    this.statusListeners.delete(fn)
  }

  /**
   * Resolve once the socket is open; reject if it closes or exhausts retries
   * before opening. When the socket is already terminally dead — `close()`d or
   * reconnect-exhausted (`disconnected`) — rejects immediately rather than
   * queuing a waiter nothing would ever settle.
   *
   * @public
   */
  ready(): Promise<void> {
    if (this.socket.readyState === PartySocketWebSocket.OPEN) {
      return Promise.resolve()
    }
    if (this.closed) {
      return Promise.reject(new Error(CLOSED_ERROR))
    }
    if (this.status === 'disconnected') {
      return Promise.reject(new Error(EXHAUSTED_ERROR))
    }
    return new Promise((resolve, reject) => {
      this.readyResolvers.push({ resolve, reject })
    })
  }
}
