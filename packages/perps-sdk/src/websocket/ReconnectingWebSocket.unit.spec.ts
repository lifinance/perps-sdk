import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { MockPartySocketWebSocket } = vi.hoisted(() => {
  class HoistedMockPartySocketWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3

    static instances: HoistedMockPartySocketWebSocket[] = []

    readyState = HoistedMockPartySocketWebSocket.CONNECTING
    retryCount = 0
    reconnectCalls = 0
    sent: string[] = []
    url: string
    options?: Record<string, unknown>
    onopen: (() => void) | null = null
    onclose: ((ev: CloseEvent) => void) | null = null
    onerror: ((ev: Event) => void) | null = null
    onmessage: ((ev: MessageEvent) => void) | null = null

    constructor(
      url: string,
      _protocols?: string | string[],
      options?: Record<string, unknown>
    ) {
      this.url = url
      this.options = options
      HoistedMockPartySocketWebSocket.instances.push(this)
    }

    send(data: string) {
      this.sent.push(data)
    }

    close() {
      this.readyState = HoistedMockPartySocketWebSocket.CLOSED
    }

    reconnect() {
      this.reconnectCalls += 1
      this.retryCount = 0
    }

    simulateOpen() {
      this.readyState = HoistedMockPartySocketWebSocket.OPEN
      this.onopen?.()
    }

    simulateClose({
      code = 1006,
      reason = '',
      retryCount,
    }: {
      code?: number
      reason?: string
      retryCount?: number
    } = {}) {
      if (retryCount !== undefined) {
        this.retryCount = retryCount
      }
      this.readyState = HoistedMockPartySocketWebSocket.CLOSED
      this.onclose?.({ code, reason } as CloseEvent)
    }

    simulateMessage(data: string) {
      this.onmessage?.({ data } as MessageEvent)
    }

    simulateError() {
      this.onerror?.(new Event('error'))
    }
  }

  return {
    MockPartySocketWebSocket: HoistedMockPartySocketWebSocket,
  }
})

vi.mock('partysocket/ws', () => ({
  default: MockPartySocketWebSocket,
}))

import { ReconnectingWebSocket } from './ReconnectingWebSocket.js'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  MockPartySocketWebSocket.instances = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function latestWs(): MockPartySocketWebSocket {
  return MockPartySocketWebSocket.instances[
    MockPartySocketWebSocket.instances.length - 1
  ]
}

describe('ReconnectingWebSocket', () => {
  it('creates a partysocket transport with retry defaults', () => {
    new ReconnectingWebSocket('wss://example.com', { maxRetries: 3 })
    expect(MockPartySocketWebSocket.instances).toHaveLength(1)
    expect(latestWs().url).toBe('wss://example.com')
    expect(latestWs().options).toMatchObject({
      maxRetries: 3,
      connectionTimeout: 4000,
      minUptime: 5000,
      maxEnqueuedMessages: 1000,
      minReconnectionDelay: 500,
      maxReconnectionDelay: 10000,
    })
  })

  it('forwards sends via partysocket while reconnecting', () => {
    const rws = new ReconnectingWebSocket('wss://example.com')
    rws.send('queued-message')
    expect(latestWs().sent).toEqual(['queued-message'])
  })

  it('registers and unregisters lifecycle listeners', () => {
    const rws = new ReconnectingWebSocket('wss://example.com')
    const onMessage = vi.fn()
    const onOpen = vi.fn()
    const onClose = vi.fn()
    const onError = vi.fn()

    rws.on('message', onMessage)
    rws.on('open', onOpen)
    rws.on('close', onClose)
    rws.on('error', onError)

    latestWs().simulateOpen()
    latestWs().simulateMessage('payload')
    latestWs().simulateError()
    latestWs().simulateClose({ code: 1006, reason: 'dropped', retryCount: 1 })

    expect(onOpen).toHaveBeenCalledOnce()
    expect(onMessage).toHaveBeenCalledWith('payload')
    expect(onError).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledWith(1006, 'dropped')

    rws.off('message', onMessage)
    latestWs().simulateMessage('ignored')
    expect(onMessage).toHaveBeenCalledTimes(1)
  })

  it('isolates throwing status and open listeners so open setup still completes', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rws = new ReconnectingWebSocket('wss://example.com')
    const readyPromise = rws.ready()
    const statusSibling = vi.fn()
    const openSibling = vi.fn()

    rws.onStatus(() => {
      throw new Error('status listener failed')
    })
    rws.onStatus(statusSibling)
    rws.on('open', () => {
      throw new Error('open listener failed')
    })
    rws.on('open', openSibling)

    latestWs().simulateOpen()

    await expect(readyPromise).resolves.toBeUndefined()
    expect(rws.getStatus()).toBe('connected')
    expect(statusSibling).toHaveBeenCalledWith('connected')
    expect(openSibling).toHaveBeenCalledOnce()
    expect(errorLog).toHaveBeenCalledTimes(2)
  })

  it('sends keepalive frames while open and stops after close()', () => {
    const rws = new ReconnectingWebSocket('wss://example.com', {
      pingIntervalMs: 1000,
      pingPayload: '{"method":"ping"}',
    })

    latestWs().simulateOpen()
    latestWs().sent = []
    vi.advanceTimersByTime(2000)
    expect(latestWs().sent).toEqual(['{"method":"ping"}', '{"method":"ping"}'])

    rws.close()
    latestWs().sent = []
    vi.advanceTimersByTime(5000)
    expect(latestWs().sent).toHaveLength(0)
  })

  it('forces reconnect when the stream is stale for staleWindowMs', () => {
    const rws = new ReconnectingWebSocket('wss://example.com', {
      pingPayload: '{"method":"ping"}',
      staleWindowMs: 2000,
    })
    const onStatus = vi.fn()
    rws.onStatus(onStatus)

    latestWs().simulateOpen()
    expect(rws.getStatus()).toBe('connected')

    vi.advanceTimersByTime(2000)
    expect(latestWs().reconnectCalls).toBe(1)
    expect(rws.getStatus()).toBe('reconnecting')
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting')
  })

  it('resets stale watchdog on each inbound message', () => {
    new ReconnectingWebSocket('wss://example.com', {
      pingPayload: '{"method":"ping"}',
      staleWindowMs: 2000,
    })

    latestWs().simulateOpen()
    vi.advanceTimersByTime(1500)
    latestWs().simulateMessage('tick')
    vi.advanceTimersByTime(1500)
    expect(latestWs().reconnectCalls).toBe(0)

    vi.advanceTimersByTime(500)
    expect(latestWs().reconnectCalls).toBe(1)
  })

  it('keeps reconnecting status until retry budget is exhausted, then becomes disconnected', async () => {
    const rws = new ReconnectingWebSocket('wss://example.com', {
      maxRetries: 2,
    })
    const onStatus = vi.fn()
    rws.onStatus(onStatus)

    latestWs().simulateOpen()
    expect(rws.getStatus()).toBe('connected')

    latestWs().simulateClose({ retryCount: 1 })
    expect(rws.getStatus()).toBe('reconnecting')
    const readyPromise = rws.ready()
    latestWs().simulateClose({ retryCount: 2 })
    expect(rws.getStatus()).toBe('reconnecting')
    latestWs().simulateClose({ retryCount: 2 })

    expect(rws.getStatus()).toBe('disconnected')
    expect(onStatus).toHaveBeenLastCalledWith('disconnected')
    await expect(readyPromise).rejects.toThrow(
      'WebSocket max reconnect attempts reached'
    )
  })

  it('reconnect() recovers a terminal disconnected socket', () => {
    const rws = new ReconnectingWebSocket('wss://example.com', {
      maxRetries: 0,
    })

    latestWs().simulateClose({ retryCount: 0 })
    expect(rws.getStatus()).toBe('disconnected')

    rws.reconnect()
    expect(latestWs().reconnectCalls).toBe(1)
    expect(rws.getStatus()).toBe('reconnecting')

    latestWs().simulateOpen()
    expect(rws.getStatus()).toBe('connected')
  })

  it('ready() resolves on open and rejects on terminal states', async () => {
    const connected = new ReconnectingWebSocket('wss://example.com')
    const waiting = connected.ready()
    latestWs().simulateOpen()
    await expect(waiting).resolves.toBeUndefined()

    const exhausted = new ReconnectingWebSocket('wss://example.com', {
      maxRetries: 0,
    })
    latestWs().simulateClose({ retryCount: 0 })
    await expect(exhausted.ready()).rejects.toThrow(
      'WebSocket max reconnect attempts reached'
    )

    const closed = new ReconnectingWebSocket('wss://example.com')
    closed.close()
    await expect(closed.ready()).rejects.toThrow('WebSocket closed')
  })
})
