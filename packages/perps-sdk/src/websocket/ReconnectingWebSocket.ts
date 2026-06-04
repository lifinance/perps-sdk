import type { WsConnectionStatus, WsStatusListener } from './types.js'

type WsEventMap = {
  open: () => void
  close: (code: number, reason: string) => void
  error: (error: Event) => void
  message: (data: string) => void
}

type WsEvent = keyof WsEventMap

/**
 * Default reconnect attempt cap. With the exponential backoff capped at 10s,
 * ten attempts span ~39s of retries before the socket is declared
 * `disconnected` — long enough for a live trading feed to ride out a transient
 * network blip.
 */
const DEFAULT_MAX_RETRIES = 10

/**
 * Options for {@link ReconnectingWebSocket}.
 *
 * @public
 */
export interface ReconnectingWebSocketOptions {
  maxRetries?: number
  pingIntervalMs?: number
}

/**
 * A `WebSocket` wrapper that auto-reconnects with exponential backoff, buffers
 * sends while disconnected, and keep-alive pings the server.
 *
 * @public
 */
export class ReconnectingWebSocket {
  private ws: WebSocket | null = null
  private readonly url: string
  private readonly maxRetries: number
  private readonly pingIntervalMs: number
  private attempt = 0
  private closed = false
  private buffer: string[] = []
  private pingTimer: ReturnType<typeof setInterval> | null = null
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
    this.url = url
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES
    this.pingIntervalMs = options?.pingIntervalMs ?? 30_000
    this.connect()
  }

  private connect() {
    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      this.attempt = 0
      this.flush()
      this.startPing()
      this.setStatus('connected')
      for (const fn of this.listeners.open) {
        fn()
      }
      for (const { resolve } of this.readyResolvers) {
        resolve()
      }
      this.readyResolvers = []
    }

    this.ws.onclose = (e) => {
      this.stopPing()
      for (const fn of this.listeners.close) {
        fn(e.code, e.reason)
      }
      if (!this.closed) {
        this.reconnect()
      }
    }

    this.ws.onerror = (e) => {
      for (const fn of this.listeners.error) {
        fn(e)
      }
    }

    this.ws.onmessage = (e) => {
      const data = typeof e.data === 'string' ? e.data : String(e.data)
      for (const fn of this.listeners.message) {
        fn(data)
      }
    }
  }

  private reconnect() {
    if (this.attempt >= this.maxRetries) {
      for (const { reject } of this.readyResolvers) {
        reject(new Error('WebSocket max reconnect attempts reached'))
      }
      this.readyResolvers = []
      this.setStatus('disconnected')
      return
    }
    this.setStatus('reconnecting')
    const delay = Math.min((1 << this.attempt) * 150, 10_000)
    this.attempt++
    setTimeout(() => {
      if (!this.closed) {
        this.connect()
      }
    }, delay)
  }

  private setStatus(status: WsConnectionStatus) {
    if (this.status === status) {
      return
    }
    this.status = status
    for (const fn of this.statusListeners) {
      fn(status)
    }
  }

  private flush() {
    for (const msg of this.buffer) {
      this.ws?.send(msg)
    }
    this.buffer = []
  }

  private startPing() {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('{"method":"ping"}')
      }
    }, this.pingIntervalMs)
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  /**
   * Send `data`, buffering it for replay when the socket is not yet open.
   *
   * @public
   */
  send(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    } else {
      this.buffer.push(data)
    }
  }

  /**
   * Permanently close the socket and suppress further reconnection.
   *
   * @public
   */
  close() {
    this.closed = true
    this.stopPing()
    this.ws?.close()
    this.ws = null
    for (const { reject } of this.readyResolvers) {
      reject(new Error('WebSocket closed'))
    }
    this.readyResolvers = []
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
   * `disconnected` once auto-reconnect is abandoned (terminal).
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
   * before opening.
   *
   * @public
   */
  ready(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      this.readyResolvers.push({ resolve, reject })
    })
  }
}
