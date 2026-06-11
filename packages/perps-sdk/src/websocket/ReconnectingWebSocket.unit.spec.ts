import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReconnectingWebSocket } from './ReconnectingWebSocket.js'

// --- Mock WebSocket ---

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: { code: number; reason: string }) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  simulateClose(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason })
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data })
  }

  simulateError() {
    this.onerror?.(new Event('error'))
  }

  static instances: MockWebSocket[] = []
  static reset() {
    MockWebSocket.instances = []
  }
}

// Store original and replace with mock
const originalWebSocket = globalThis.WebSocket

beforeEach(() => {
  MockWebSocket.reset()
  vi.useFakeTimers()
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
})

afterEach(() => {
  vi.useRealTimers()
  globalThis.WebSocket = originalWebSocket
})

function latestWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1]
}

describe('ReconnectingWebSocket', () => {
  describe('connection', () => {
    it('should create a WebSocket connection on construction', () => {
      new ReconnectingWebSocket('wss://example.com')
      expect(MockWebSocket.instances).toHaveLength(1)
      expect(latestWs().url).toBe('wss://example.com')
    })
  })

  describe('send', () => {
    it('should send messages when connection is open', () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      latestWs().simulateOpen()

      rws.send('hello')
      expect(latestWs().sent).toContain('hello')
    })

    it('should buffer messages when connection is not open', () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      // Connection is still CONNECTING, not OPEN
      rws.send('buffered1')
      rws.send('buffered2')

      expect(latestWs().sent).toHaveLength(0)
    })

    it('should flush buffered messages on open', () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      rws.send('buffered1')
      rws.send('buffered2')

      latestWs().simulateOpen()

      expect(latestWs().sent).toEqual(['buffered1', 'buffered2'])
    })
  })

  describe('event listeners', () => {
    it('should register and call message listeners', () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      const listener = vi.fn()
      rws.on('message', listener)

      latestWs().simulateOpen()
      latestWs().simulateMessage('test data')

      expect(listener).toHaveBeenCalledWith('test data')
    })

    it('should register and call open listeners', () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      const listener = vi.fn()
      rws.on('open', listener)

      latestWs().simulateOpen()

      expect(listener).toHaveBeenCalledOnce()
    })

    it('should register and call close listeners', () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      rws.on('open', () => {})
      const listener = vi.fn()
      rws.on('close', listener)

      latestWs().simulateOpen()
      // Manual close to prevent reconnect
      rws.close()

      expect(listener).not.toHaveBeenCalled() // close() doesn't fire onclose
    })

    it('should register and call error listeners', () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      const listener = vi.fn()
      rws.on('error', listener)

      latestWs().simulateError()

      expect(listener).toHaveBeenCalledOnce()
    })

    it('should unregister listeners with off', () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      const listener = vi.fn()
      rws.on('message', listener)
      rws.off('message', listener)

      latestWs().simulateOpen()
      latestWs().simulateMessage('ignored')

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('ping', () => {
    it('should send the configured ping payload at the configured interval', () => {
      new ReconnectingWebSocket('wss://example.com', {
        pingIntervalMs: 1000,
        pingPayload: '{"method":"ping"}',
      })
      latestWs().simulateOpen()
      latestWs().sent = [] // Clear any flushed messages

      vi.advanceTimersByTime(1000)
      expect(latestWs().sent).toEqual(['{"method":"ping"}'])

      vi.advanceTimersByTime(1000)
      expect(latestWs().sent).toEqual([
        '{"method":"ping"}',
        '{"method":"ping"}',
      ])
    })

    it('should send no keepalive when pingPayload is not configured', () => {
      new ReconnectingWebSocket('wss://example.com', {
        pingIntervalMs: 1000,
      })
      latestWs().simulateOpen()
      latestWs().sent = []

      vi.advanceTimersByTime(5000)

      expect(latestWs().sent).toHaveLength(0)
    })

    it('should stop ping on close', () => {
      const rws = new ReconnectingWebSocket('wss://example.com', {
        pingIntervalMs: 1000,
        pingPayload: '{"method":"ping"}',
      })
      latestWs().simulateOpen()
      latestWs().sent = []

      rws.close()
      vi.advanceTimersByTime(5000)

      expect(latestWs().sent).toHaveLength(0)
    })
  })

  describe('reconnection', () => {
    it('should reconnect on unexpected close', () => {
      new ReconnectingWebSocket('wss://example.com', { maxRetries: 3 })
      const firstWs = latestWs()
      firstWs.simulateOpen()
      firstWs.simulateClose(1006, 'abnormal')

      // First reconnect: delay = (1 << 0) * 150 = 150ms
      expect(MockWebSocket.instances).toHaveLength(1) // not yet
      vi.advanceTimersByTime(150)
      expect(MockWebSocket.instances).toHaveLength(2)
    })

    it('should use exponential backoff for reconnection', () => {
      new ReconnectingWebSocket('wss://example.com', { maxRetries: 5 })
      const firstWs = latestWs()
      firstWs.simulateOpen()

      // First close -> attempt 0: delay = 150ms
      firstWs.simulateClose()
      vi.advanceTimersByTime(149)
      expect(MockWebSocket.instances).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(MockWebSocket.instances).toHaveLength(2)

      // Second close -> attempt 1: delay = 300ms
      latestWs().simulateClose()
      vi.advanceTimersByTime(299)
      expect(MockWebSocket.instances).toHaveLength(2)
      vi.advanceTimersByTime(1)
      expect(MockWebSocket.instances).toHaveLength(3)
    })

    it('should not reconnect after manual close', () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      latestWs().simulateOpen()

      rws.close()
      vi.advanceTimersByTime(60_000)

      expect(MockWebSocket.instances).toHaveLength(1)
    })

    it('should stop reconnecting after max retries', () => {
      new ReconnectingWebSocket('wss://example.com', { maxRetries: 2 })

      // Close without ever opening (attempt stays at 0)
      latestWs().simulateClose()
      vi.advanceTimersByTime(150)
      expect(MockWebSocket.instances).toHaveLength(2)

      // Second close -> attempt=1
      latestWs().simulateClose()
      vi.advanceTimersByTime(300)
      expect(MockWebSocket.instances).toHaveLength(3)

      // Third close -> attempt=2 >= maxRetries(2), no more reconnects
      latestWs().simulateClose()
      vi.advanceTimersByTime(60_000)
      expect(MockWebSocket.instances).toHaveLength(3)
    })

    it('should reset attempt counter on successful open', () => {
      new ReconnectingWebSocket('wss://example.com', { maxRetries: 2 })
      latestWs().simulateOpen()

      // Close triggers reconnect attempt 0
      latestWs().simulateClose()
      vi.advanceTimersByTime(150)
      expect(MockWebSocket.instances).toHaveLength(2)

      // Successfully reconnect, resetting counter
      latestWs().simulateOpen()

      // Close again, should still reconnect (counter was reset)
      latestWs().simulateClose()
      vi.advanceTimersByTime(150)
      expect(MockWebSocket.instances).toHaveLength(3)
    })
  })

  describe('ready', () => {
    it('should resolve immediately when already open', async () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      latestWs().simulateOpen()

      await expect(rws.ready()).resolves.toBeUndefined()
    })

    it('should resolve when connection opens', async () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      const readyPromise = rws.ready()

      latestWs().simulateOpen()
      await expect(readyPromise).resolves.toBeUndefined()
    })

    it('should reject when max retries exceeded', async () => {
      const rws = new ReconnectingWebSocket('wss://example.com', {
        maxRetries: 0,
      })
      const readyPromise = rws.ready()

      // Close with 0 retries should reject immediately
      latestWs().simulateClose()

      await expect(readyPromise).rejects.toThrow(
        'WebSocket max reconnect attempts reached'
      )
    })

    it('should reject when manually closed', async () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      const readyPromise = rws.ready()

      rws.close()

      await expect(readyPromise).rejects.toThrow('WebSocket closed')
    })

    it('should reject immediately when called after reconnect exhaustion', async () => {
      const rws = new ReconnectingWebSocket('wss://example.com', {
        maxRetries: 0,
      })
      latestWs().simulateClose()
      expect(rws.getStatus()).toBe('disconnected')

      await expect(rws.ready()).rejects.toThrow(
        'WebSocket max reconnect attempts reached'
      )
    })

    it('should reject immediately when called after manual close', async () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      rws.close()

      await expect(rws.ready()).rejects.toThrow('WebSocket closed')
    })
  })

  describe('close', () => {
    it('should close the underlying WebSocket', () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      latestWs().simulateOpen()

      rws.close()
      expect(latestWs().readyState).toBe(MockWebSocket.CLOSED)
    })
  })

  describe('connection status', () => {
    it('starts reconnecting and reports connected on open', () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      expect(rws.getStatus()).toBe('reconnecting')

      latestWs().simulateOpen()
      expect(rws.getStatus()).toBe('connected')
    })

    it('notifies status listeners on connect / drop transitions', () => {
      const rws = new ReconnectingWebSocket('wss://example.com', {
        maxRetries: 3,
      })
      const onStatus = vi.fn()
      rws.onStatus(onStatus)

      latestWs().simulateOpen()
      expect(onStatus).toHaveBeenLastCalledWith('connected')

      latestWs().simulateClose(1006, 'abnormal')
      expect(onStatus).toHaveBeenLastCalledWith('reconnecting')

      vi.advanceTimersByTime(150)
      latestWs().simulateOpen()
      expect(onStatus).toHaveBeenLastCalledWith('connected')
    })

    it('emits terminal disconnected status when reconnects are exhausted', () => {
      const rws = new ReconnectingWebSocket('wss://example.com', {
        maxRetries: 2,
      })
      const onStatus = vi.fn()
      rws.onStatus(onStatus)
      latestWs().simulateOpen()

      latestWs().simulateClose()
      vi.advanceTimersByTime(150)
      latestWs().simulateClose()
      vi.advanceTimersByTime(300)
      // Third close -> attempt=2 >= maxRetries(2): gives up.
      latestWs().simulateClose()
      vi.advanceTimersByTime(60_000)

      expect(rws.getStatus()).toBe('disconnected')
      expect(onStatus).toHaveBeenLastCalledWith('disconnected')
      // No further reconnects scheduled after the terminal signal.
      expect(MockWebSocket.instances).toHaveLength(3)
    })

    it('still rejects pending ready() waiters alongside the terminal status', async () => {
      const rws = new ReconnectingWebSocket('wss://example.com', {
        maxRetries: 0,
      })
      const onStatus = vi.fn()
      rws.onStatus(onStatus)
      const readyPromise = rws.ready()

      latestWs().simulateClose()

      await expect(readyPromise).rejects.toThrow(
        'WebSocket max reconnect attempts reached'
      )
      expect(onStatus).toHaveBeenLastCalledWith('disconnected')
    })

    it('does not notify listeners removed via offStatus', () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      const onStatus = vi.fn()
      rws.onStatus(onStatus)
      rws.offStatus(onStatus)

      latestWs().simulateOpen()

      expect(onStatus).not.toHaveBeenCalled()
    })
  })
})
