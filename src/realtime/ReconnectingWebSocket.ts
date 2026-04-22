type WsEventMap = {
  open: () => void
  close: (code: number, reason: string) => void
  error: (error: Event) => void
  message: (data: string) => void
}

type WsEvent = keyof WsEventMap

export interface ReconnectingWebSocketOptions {
  /**
   * Maximum number of reconnect attempts before giving up. Defaults to 10,
   * which covers ~49s of cumulative backoff with the default timing — enough
   * to ride out a typical short-lived network blip. The previous default of
   * 3 surrendered after ~1s, which is too aggressive for a realtime client.
   */
  maxRetries?: number
  /**
   * Interval between heartbeat pings in milliseconds. Defaults to 30_000.
   */
  pingIntervalMs?: number
  /**
   * Base delay for the exponential backoff in milliseconds. The nth
   * reconnect attempt waits up to `(2 ** n) * baseDelayMs`, capped at
   * `maxDelayMs`. Defaults to 150.
   */
  baseDelayMs?: number
  /**
   * Maximum delay between reconnect attempts in milliseconds. Defaults to
   * 10_000.
   */
  maxDelayMs?: number
  /**
   * Apply equal-jitter to reconnect delays to avoid a thundering-herd when
   * many clients reconnect after the same server event. When enabled
   * (default), the actual delay is uniformly distributed in `[base/2, base)`.
   * Set to false for deterministic timing (e.g. in tests).
   */
  jitter?: boolean
}

export class ReconnectingWebSocket {
  private ws: WebSocket | null = null
  private readonly url: string
  private readonly maxRetries: number
  private readonly pingIntervalMs: number
  private readonly baseDelayMs: number
  private readonly maxDelayMs: number
  private readonly jitter: boolean
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
  private readyResolvers: Array<{
    resolve: () => void
    reject: (e: Error) => void
  }> = []

  constructor(url: string, options?: ReconnectingWebSocketOptions) {
    this.url = url
    this.maxRetries = options?.maxRetries ?? 10
    this.pingIntervalMs = options?.pingIntervalMs ?? 30_000
    this.baseDelayMs = options?.baseDelayMs ?? 150
    this.maxDelayMs = options?.maxDelayMs ?? 10_000
    this.jitter = options?.jitter ?? true
    this.connect()
  }

  private connect() {
    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      this.attempt = 0
      this.flush()
      this.startPing()
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
      return
    }
    const base = Math.min(
      (1 << this.attempt) * this.baseDelayMs,
      this.maxDelayMs
    )
    // Equal-jitter: delay ∈ [base/2, base). Spreads reconnect timing across
    // clients so a common disconnect event doesn't produce a reconnect storm.
    const delay = this.jitter ? base / 2 + Math.random() * (base / 2) : base
    this.attempt++
    setTimeout(() => {
      if (!this.closed) {
        this.connect()
      }
    }, delay)
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

  send(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    } else {
      this.buffer.push(data)
    }
  }

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

  on<E extends WsEvent>(event: E, fn: WsEventMap[E]) {
    ;(this.listeners[event] as Set<WsEventMap[E]>).add(fn)
  }

  off<E extends WsEvent>(event: E, fn: WsEventMap[E]) {
    ;(this.listeners[event] as Set<WsEventMap[E]>).delete(fn)
  }

  ready(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      this.readyResolvers.push({ resolve, reject })
    })
  }
}
