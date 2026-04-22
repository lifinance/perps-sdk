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
  vi.restoreAllMocks()
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
    it('should send ping messages at configured interval', () => {
      new ReconnectingWebSocket('wss://example.com', {
        pingIntervalMs: 1000,
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

    it('should stop ping on close', () => {
      const rws = new ReconnectingWebSocket('wss://example.com', {
        pingIntervalMs: 1000,
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
      new ReconnectingWebSocket('wss://example.com', {
        maxRetries: 3,
        jitter: false,
      })
      const firstWs = latestWs()
      firstWs.simulateOpen()
      firstWs.simulateClose(1006, 'abnormal')

      // First reconnect: delay = (1 << 0) * 150 = 150ms
      expect(MockWebSocket.instances).toHaveLength(1) // not yet
      vi.advanceTimersByTime(150)
      expect(MockWebSocket.instances).toHaveLength(2)
    })

    it('should use exponential backoff for reconnection', () => {
      new ReconnectingWebSocket('wss://example.com', {
        maxRetries: 5,
        jitter: false,
      })
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
      new ReconnectingWebSocket('wss://example.com', {
        maxRetries: 2,
        jitter: false,
      })

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
      new ReconnectingWebSocket('wss://example.com', {
        maxRetries: 2,
        jitter: false,
      })
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

  describe('jitter', () => {
    it('applies equal-jitter: min delay (base/2) when random is 0', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      new ReconnectingWebSocket('wss://example.com')
      latestWs().simulateClose()

      // base=150, random=0 → delay = 75
      vi.advanceTimersByTime(74)
      expect(MockWebSocket.instances).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(MockWebSocket.instances).toHaveLength(2)
    })

    it('applies equal-jitter: max delay (base) when random is 1', () => {
      vi.spyOn(Math, 'random').mockReturnValue(1)
      new ReconnectingWebSocket('wss://example.com')
      latestWs().simulateClose()

      // base=150, random=1 → delay = 150
      vi.advanceTimersByTime(149)
      expect(MockWebSocket.instances).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(MockWebSocket.instances).toHaveLength(2)
    })

    it('does not call Math.random when jitter is disabled', () => {
      const randomSpy = vi.spyOn(Math, 'random')
      new ReconnectingWebSocket('wss://example.com', { jitter: false })
      latestWs().simulateClose()

      // No jitter: delay = base = 150 exactly
      vi.advanceTimersByTime(149)
      expect(MockWebSocket.instances).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(MockWebSocket.instances).toHaveLength(2)
      expect(randomSpy).not.toHaveBeenCalled()
    })

    it('respects custom baseDelayMs', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      new ReconnectingWebSocket('wss://example.com', { baseDelayMs: 1000 })
      latestWs().simulateClose()

      // base=1000, random=0 → delay = 500
      vi.advanceTimersByTime(499)
      expect(MockWebSocket.instances).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(MockWebSocket.instances).toHaveLength(2)
    })

    it('caps backoff base at maxDelayMs', () => {
      new ReconnectingWebSocket('wss://example.com', {
        baseDelayMs: 1000,
        maxDelayMs: 2000,
        jitter: false,
      })

      // attempt=0: (1<<0)*1000 = 1000
      latestWs().simulateClose()
      vi.advanceTimersByTime(1000)
      expect(MockWebSocket.instances).toHaveLength(2)

      // attempt=1: (1<<1)*1000 = 2000 (at cap)
      latestWs().simulateClose()
      vi.advanceTimersByTime(2000)
      expect(MockWebSocket.instances).toHaveLength(3)

      // attempt=2: (1<<2)*1000 = 4000 → capped at 2000
      latestWs().simulateClose()
      vi.advanceTimersByTime(1999)
      expect(MockWebSocket.instances).toHaveLength(3)
      vi.advanceTimersByTime(1)
      expect(MockWebSocket.instances).toHaveLength(4)
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
  })

  describe('close', () => {
    it('should close the underlying WebSocket', () => {
      const rws = new ReconnectingWebSocket('wss://example.com')
      latestWs().simulateOpen()

      rws.close()
      expect(latestWs().readyState).toBe(MockWebSocket.CLOSED)
    })
  })
})
