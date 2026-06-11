import type { Subscription, SubscriptionEvent } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReconnectingWebSocket } from './ReconnectingWebSocket.js'
import type { SubscriptionListener, WsConnectionStatus } from './types.js'
import {
  WS_CHANNEL_TEARDOWN_LINGER_MS,
  WsProviderBase,
} from './WsProviderBase.js'

/** Minimal stand-in for ReconnectingWebSocket — the base only calls these. */
class MockRws {
  openHandlers: Array<() => void> = []
  statusHandlers: Array<(s: WsConnectionStatus) => void> = []
  status: WsConnectionStatus = 'connected'
  sent: string[] = []
  closed = false

  on(event: string, fn: (...args: any[]) => void) {
    if (event === 'open') {
      this.openHandlers.push(fn)
    }
  }
  onStatus(fn: (s: WsConnectionStatus) => void) {
    this.statusHandlers.push(fn)
  }
  getStatus(): WsConnectionStatus {
    return this.status
  }
  send(data: string) {
    this.sent.push(data)
  }
  ready(): Promise<void> {
    return Promise.resolve()
  }
  close() {
    this.closed = true
  }
  simulateOpen() {
    for (const fn of this.openHandlers) {
      fn()
    }
  }
  simulateStatus(s: WsConnectionStatus) {
    this.status = s
    for (const fn of this.statusHandlers) {
      fn(s)
    }
  }
}

/** Concrete base subclass that records hook calls and lets each test drive `openChannel`. */
class TestProvider extends WsProviderBase<{ id: string }> {
  openCount = 0
  onCloseSpy = vi.fn()
  sendSubscribeSpy = vi.fn()
  /** Overridable per test; defaults to a fresh teardown spy. */
  openImpl: (sub: Subscription) => Promise<() => void> = async () => vi.fn()

  constructor(rws: MockRws) {
    super(rws as unknown as ReconnectingWebSocket, 'test')
  }

  protected toKey(sub: Subscription): string {
    return sub.channel
  }
  protected openChannel(sub: Subscription): Promise<() => void> {
    this.openCount += 1
    return this.openImpl(sub)
  }
  protected sendSubscribe(state: { id: string }): void | Promise<void> {
    return this.sendSubscribeSpy(state)
  }
  protected onClose(): void {
    this.onCloseSpy()
  }
  protected handleMessage(): void {}

  /** Test hook into the base's protected fan-out. */
  deliver(key: string, event: SubscriptionEvent) {
    this.emit(key, event)
  }

  /** Test hook into the base's protected idle-channel reclaim. */
  expireIdle(key: string): boolean {
    return this.closeChannelIfIdle(key)
  }

  /** Test hooks into the base's protected wire-sub registry. */
  register(key: string, state: { id: string }): Promise<void> {
    return this.registerSub(key, state)
  }
  unregister(key: string): void {
    this.unregisterSub(key)
  }
}

const PRICES = { channel: 'prices', dex: 'test' } as Subscription
const priceEvent = {
  channel: 'prices',
  data: { BTC: '1' },
} as SubscriptionEvent

afterEach(() => {
  vi.useRealTimers()
})

describe('WsProviderBase — ref-counted fan-out', () => {
  it('opens the channel once for two concurrent consumers of the same key', async () => {
    const p = new TestProvider(new MockRws())
    await p.subscribe(PRICES, vi.fn())
    await p.subscribe(PRICES, vi.fn())
    expect(p.openCount).toBe(1)
  })

  it('dedupes an in-flight open: a second subscribe before the first resolves does not re-open', async () => {
    const p = new TestProvider(new MockRws())
    let resolveOpen!: (td: () => void) => void
    p.openImpl = () =>
      new Promise<() => void>((r) => {
        resolveOpen = r
      })

    const s1 = p.subscribe(PRICES, vi.fn())
    const s2 = p.subscribe(PRICES, vi.fn())
    resolveOpen(vi.fn())
    await Promise.all([s1, s2])

    expect(p.openCount).toBe(1)
  })

  it('keeps delivering to a shared listener after a sibling unsubscribe', async () => {
    const p = new TestProvider(new MockRws())
    const listener: SubscriptionListener = vi.fn()

    const unsub1 = await p.subscribe(PRICES, listener)
    await p.subscribe(PRICES, listener) // same reference, count → 2

    unsub1() // count → 1, still registered
    p.deliver('prices', priceEvent)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('WsProviderBase — open failure', () => {
  it('rejects every concurrent subscriber when the shared open fails', async () => {
    const p = new TestProvider(new MockRws())
    let rejectOpen!: (e: Error) => void
    p.openImpl = () =>
      new Promise<() => void>((_, reject) => {
        rejectOpen = reject
      })

    const s1 = p.subscribe(PRICES, vi.fn())
    const s2 = p.subscribe(PRICES, vi.fn())
    rejectOpen(new Error('WebSocket max reconnect attempts reached'))

    await expect(s1).rejects.toThrow('WebSocket max reconnect attempts reached')
    await expect(s2).rejects.toThrow('WebSocket max reconnect attempts reached')
  })

  it('evicts the entry on a failed open so a later subscribe re-opens', async () => {
    const p = new TestProvider(new MockRws())
    p.openImpl = async () => {
      throw new Error('open failed')
    }
    await expect(p.subscribe(PRICES, vi.fn())).rejects.toThrow('open failed')

    p.openImpl = async () => vi.fn()
    const listener = vi.fn()
    await p.subscribe(PRICES, listener)
    expect(p.openCount).toBe(2)

    p.deliver('prices', priceEvent)
    expect(listener).toHaveBeenCalledWith(priceEvent)
  })
})

describe('WsProviderBase — deferred teardown', () => {
  it('does not tear down synchronously; fires the teardown once after the linger', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const teardown = vi.fn()
    p.openImpl = async () => teardown

    const unsub = await p.subscribe(PRICES, vi.fn())
    unsub()
    expect(teardown).not.toHaveBeenCalled()

    vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS)
    expect(teardown).toHaveBeenCalledTimes(1)
  })

  it('cancels the teardown when a re-subscribe arrives within the linger (StrictMode 1→0→1)', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const teardown = vi.fn()
    p.openImpl = async () => teardown

    const unsub = await p.subscribe(PRICES, vi.fn())
    unsub() // schedule teardown
    await p.subscribe(PRICES, vi.fn()) // re-subscribe within the window cancels it

    vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS * 2)
    expect(teardown).not.toHaveBeenCalled()
    expect(p.openCount).toBe(1) // reused, never re-opened
  })

  it('close() clears a pending teardown timer and runs onClose', async () => {
    vi.useFakeTimers()
    const rws = new MockRws()
    const p = new TestProvider(rws)
    const teardown = vi.fn()
    p.openImpl = async () => teardown

    const unsub = await p.subscribe(PRICES, vi.fn())
    unsub() // schedule teardown
    p.close()

    vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS * 2)
    expect(teardown).not.toHaveBeenCalled() // timer cleared by close()
    expect(p.onCloseSpy).toHaveBeenCalledTimes(1)
    expect(rws.closed).toBe(true)
  })
})

describe('WsProviderBase — closeChannelIfIdle', () => {
  it('tears down a lingering listener-free channel immediately, exactly once', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const teardown = vi.fn()
    p.openImpl = async () => teardown

    const unsub = await p.subscribe(PRICES, vi.fn())
    unsub() // teardown deferred by the linger

    expect(p.expireIdle('prices')).toBe(true)
    expect(teardown).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS * 2)
    expect(teardown).toHaveBeenCalledTimes(1) // linger timer was cancelled
  })

  it('refuses to touch a channel that still has listeners', async () => {
    const p = new TestProvider(new MockRws())
    const teardown = vi.fn()
    p.openImpl = async () => teardown
    const listener: SubscriptionListener = vi.fn()

    await p.subscribe(PRICES, listener)

    expect(p.expireIdle('prices')).toBe(false)
    expect(teardown).not.toHaveBeenCalled()
    p.deliver('prices', priceEvent)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reports an unknown key as already free', () => {
    const p = new TestProvider(new MockRws())
    expect(p.expireIdle('prices')).toBe(true)
  })

  it('lets a re-subscribe after the expiry open the channel afresh', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const teardown = vi.fn()
    p.openImpl = async () => teardown

    const unsub = await p.subscribe(PRICES, vi.fn())
    unsub()
    p.expireIdle('prices')

    const listener: SubscriptionListener = vi.fn()
    await p.subscribe(PRICES, listener)
    expect(p.openCount).toBe(2)
    p.deliver('prices', priceEvent)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('WsProviderBase — status fan-out', () => {
  it('delivers current status on subscribe and forwards transitions, dropping on unsubscribe', async () => {
    const rws = new MockRws()
    rws.status = 'connected'
    const p = new TestProvider(rws)
    const onStatus = vi.fn()

    const unsub = await p.subscribe(PRICES, vi.fn(), onStatus)
    expect(onStatus).toHaveBeenLastCalledWith('connected')

    rws.simulateStatus('reconnecting')
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting')

    unsub()
    onStatus.mockClear()
    rws.simulateStatus('disconnected')
    expect(onStatus).not.toHaveBeenCalled()
  })
})

const flushAsync = () => new Promise<void>((r) => setTimeout(r, 0))

describe('WsProviderBase — wire-sub registry & replay', () => {
  it('sends exactly one subscribe frame per cycle across open→close→reopen', async () => {
    const rws = new MockRws() // starts 'connected'
    const p = new TestProvider(rws)
    p.openImpl = async () => {
      await p.register('prices', { id: 'prices' })
      return vi.fn()
    }

    await p.subscribe(PRICES, vi.fn())
    expect(p.sendSubscribeSpy).toHaveBeenCalledTimes(1)

    rws.simulateStatus('reconnecting')
    rws.simulateStatus('connected')
    rws.simulateOpen()
    await flushAsync()
    expect(p.sendSubscribeSpy).toHaveBeenCalledTimes(2)
    expect(p.sendSubscribeSpy).toHaveBeenNthCalledWith(2, { id: 'prices' })
  })

  it('records but does not send while the socket is down; the open replay is the sole sender', async () => {
    const rws = new MockRws()
    rws.status = 'reconnecting'
    const p = new TestProvider(rws)

    await p.register('prices', { id: 'prices' })
    expect(p.sendSubscribeSpy).not.toHaveBeenCalled()

    rws.simulateStatus('connected')
    rws.simulateOpen()
    await flushAsync()
    expect(p.sendSubscribeSpy).toHaveBeenCalledTimes(1)
  })

  it('stops replaying an unregistered sub', async () => {
    const rws = new MockRws()
    rws.status = 'reconnecting'
    const p = new TestProvider(rws)

    await p.register('prices', { id: 'prices' })
    p.unregister('prices')

    rws.simulateStatus('connected')
    rws.simulateOpen()
    await flushAsync()
    expect(p.sendSubscribeSpy).not.toHaveBeenCalled()
  })

  it('isolates a failing replay: remaining subs still resubscribe and the failure is logged', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rws = new MockRws()
    rws.status = 'reconnecting'
    const p = new TestProvider(rws)

    await p.register('bad', { id: 'bad' })
    await p.register('ok', { id: 'ok' })
    p.sendSubscribeSpy.mockImplementation(async (s: { id: string }) => {
      if (s.id === 'bad') {
        throw new Error('auth fetch rejected')
      }
    })

    rws.simulateStatus('connected')
    rws.simulateOpen()
    await flushAsync()

    expect(p.sendSubscribeSpy).toHaveBeenCalledWith({ id: 'ok' })
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("'bad'"),
      expect.any(Error)
    )
    errSpy.mockRestore()
  })

  it('drops the registry entry when the connected inline send fails, so the failed sub is not replayed', async () => {
    const rws = new MockRws() // 'connected' — register sends inline
    const p = new TestProvider(rws)
    p.sendSubscribeSpy.mockRejectedValueOnce(new Error('no auth token'))

    await expect(p.register('bad', { id: 'bad' })).rejects.toThrow(
      'no auth token'
    )

    p.sendSubscribeSpy.mockClear()
    rws.simulateOpen()
    await flushAsync()
    expect(p.sendSubscribeSpy).not.toHaveBeenCalled()
  })
})
