type WsEventMap = {
  open: () => void
  close: (code: number, reason: string) => void
  error: (error: Event) => void
  message: (data: string) => void
}

type WsEvent = keyof WsEventMap

export interface ReconnectingWebSocketOptions {
  maxRetries?: number
  pingIntervalMs?: number
}

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
  private readyResolvers: Array<{
    resolve: () => void
    reject: (e: Error) => void
  }> = []

  constructor(url: string, options?: ReconnectingWebSocketOptions) {
    this.url = url
    this.maxRetries = options?.maxRetries ?? 3
    this.pingIntervalMs = options?.pingIntervalMs ?? 30_000
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
    const delay = Math.min((1 << this.attempt) * 150, 10_000)
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
