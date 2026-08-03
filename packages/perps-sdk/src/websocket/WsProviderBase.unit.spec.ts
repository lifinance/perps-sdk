import type {
  MarketsContextEvent,
  MarketsContextSubscription,
  Subscription,
  SubscriptionEvent,
  TradesSubscription,
} from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ProviderGetQuoteParams,
  QuoteListener,
} from '../types/provider.js'
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
  reconnectCalls = 0

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
    this.simulateStatus('disconnected')
  }
  reconnect() {
    this.reconnectCalls += 1
    this.simulateStatus('reconnecting')
  }
  simulateOpen() {
    this.simulateStatus('connected')
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

  subscribeQuote(
    _params: ProviderGetQuoteParams,
    _onQuote: QuoteListener
  ): Promise<() => void> {
    return Promise.resolve(vi.fn())
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
  protected override onClose(): void {
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

const MARKETS_CONTEXT = {
  channel: 'marketsContext',
  dex: 'test',
} satisfies MarketsContextSubscription
const marketsContextEvent: MarketsContextEvent = {
  channel: 'marketsContext',
  data: {},
}

afterEach(() => {
  vi.useRealTimers()
})

describe('WsProviderBase — ref-counted fan-out', () => {
  it('opens the channel once for two concurrent consumers of the same key', async () => {
    const p = new TestProvider(new MockRws())
    await p.subscribe(MARKETS_CONTEXT, vi.fn())
    await p.subscribe(MARKETS_CONTEXT, vi.fn())
    expect(p.openCount).toBe(1)
  })

  it('dedupes an in-flight open: a second subscribe before the first resolves does not re-open', async () => {
    const p = new TestProvider(new MockRws())
    let resolveOpen!: (td: () => void) => void
    p.openImpl = () =>
      new Promise<() => void>((r) => {
        resolveOpen = r
      })

    const s1 = p.subscribe(MARKETS_CONTEXT, vi.fn())
    const s2 = p.subscribe(MARKETS_CONTEXT, vi.fn())
    resolveOpen(vi.fn())
    await Promise.all([s1, s2])

    expect(p.openCount).toBe(1)
  })

  it('keeps delivering to a shared listener after a sibling unsubscribe', async () => {
    const p = new TestProvider(new MockRws())
    const listener: SubscriptionListener = vi.fn()

    const unsub1 = await p.subscribe(MARKETS_CONTEXT, listener)
    await p.subscribe(MARKETS_CONTEXT, listener) // same reference, count → 2

    unsub1() // count → 1, still registered
    p.deliver('marketsContext', marketsContextEvent)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('double-invoking one unsubscribe closure does not drop a sibling subscription', async () => {
    const p = new TestProvider(new MockRws())
    const listener: SubscriptionListener = vi.fn()

    const unsub1 = await p.subscribe(MARKETS_CONTEXT, listener)
    await p.subscribe(MARKETS_CONTEXT, listener) // same reference, count → 2

    unsub1() // count → 1, still registered
    unsub1() // repeat invocation must be a no-op, not a second decrement
    p.deliver('marketsContext', marketsContextEvent)
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

    const s1 = p.subscribe(MARKETS_CONTEXT, vi.fn())
    const s2 = p.subscribe(MARKETS_CONTEXT, vi.fn())
    rejectOpen(new Error('WebSocket max reconnect attempts reached'))

    await expect(s1).rejects.toThrow('WebSocket max reconnect attempts reached')
    await expect(s2).rejects.toThrow('WebSocket max reconnect attempts reached')
  })

  it('evicts the entry on a failed open so a later subscribe re-opens', async () => {
    const p = new TestProvider(new MockRws())
    p.openImpl = async () => {
      throw new Error('open failed')
    }
    await expect(p.subscribe(MARKETS_CONTEXT, vi.fn())).rejects.toThrow(
      'open failed'
    )

    p.openImpl = async () => vi.fn()
    const listener = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, listener)
    expect(p.openCount).toBe(2)

    p.deliver('marketsContext', marketsContextEvent)
    expect(listener).toHaveBeenCalledWith(marketsContextEvent)
  })
})

describe('WsProviderBase — deferred teardown', () => {
  it('does not tear down synchronously; fires the teardown once after the linger', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const teardown = vi.fn()
    p.openImpl = async () => teardown

    const unsub = await p.subscribe(MARKETS_CONTEXT, vi.fn())
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

    const unsub = await p.subscribe(MARKETS_CONTEXT, vi.fn())
    unsub() // schedule teardown
    await p.subscribe(MARKETS_CONTEXT, vi.fn()) // re-subscribe within the window cancels it

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

    const unsub = await p.subscribe(MARKETS_CONTEXT, vi.fn())
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

    const unsub = await p.subscribe(MARKETS_CONTEXT, vi.fn())
    unsub() // teardown deferred by the linger

    expect(p.expireIdle('marketsContext')).toBe(true)
    expect(teardown).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS * 2)
    expect(teardown).toHaveBeenCalledTimes(1) // linger timer was cancelled
  })

  it('refuses to touch a channel that still has listeners', async () => {
    const p = new TestProvider(new MockRws())
    const teardown = vi.fn()
    p.openImpl = async () => teardown
    const listener: SubscriptionListener = vi.fn()

    await p.subscribe(MARKETS_CONTEXT, listener)

    expect(p.expireIdle('marketsContext')).toBe(false)
    expect(teardown).not.toHaveBeenCalled()
    p.deliver('marketsContext', marketsContextEvent)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reports an unknown key as already free', () => {
    const p = new TestProvider(new MockRws())
    expect(p.expireIdle('marketsContext')).toBe(true)
  })

  it('lets a re-subscribe after the expiry open the channel afresh', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const teardown = vi.fn()
    p.openImpl = async () => teardown

    const unsub = await p.subscribe(MARKETS_CONTEXT, vi.fn())
    unsub()
    p.expireIdle('marketsContext')

    const listener: SubscriptionListener = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, listener)
    expect(p.openCount).toBe(2)
    p.deliver('marketsContext', marketsContextEvent)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('WsProviderBase — status fan-out', () => {
  it('delivers current status on subscribe and forwards transitions, dropping on unsubscribe', async () => {
    const rws = new MockRws()
    rws.status = 'connected'
    const p = new TestProvider(rws)
    const onStatus = vi.fn()

    const unsub = await p.subscribe(MARKETS_CONTEXT, vi.fn(), onStatus)
    expect(onStatus).toHaveBeenLastCalledWith('connected')

    rws.simulateStatus('reconnecting')
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting')

    unsub()
    onStatus.mockClear()
    rws.simulateStatus('disconnected')
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('isolates throwing status listeners so siblings still receive transitions', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rws = new MockRws()
    rws.status = 'connected'
    const p = new TestProvider(rws)
    const stableStatus = vi.fn()
    const throwingStatus = vi.fn((status: WsConnectionStatus) => {
      if (status === 'reconnecting') {
        throw new Error('status listener failed')
      }
    })

    await p.subscribe(MARKETS_CONTEXT, vi.fn(), throwingStatus)
    await p.subscribe(MARKETS_CONTEXT, vi.fn(), stableStatus)
    stableStatus.mockClear()

    rws.simulateStatus('reconnecting')

    expect(stableStatus).toHaveBeenCalledWith('reconnecting')
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("listener threw during 'status' fan-out"),
      expect.any(Error)
    )
    errorLog.mockRestore()
  })
})

describe('WsProviderBase — emit fan-out', () => {
  it('isolates a throwing subscription listener so sibling listeners still receive the frame', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const p = new TestProvider(new MockRws())
    const stableListener = vi.fn()

    await p.subscribe(MARKETS_CONTEXT, () => {
      throw new Error('listener failed')
    })
    await p.subscribe(MARKETS_CONTEXT, stableListener)

    p.deliver('marketsContext', marketsContextEvent)

    expect(stableListener).toHaveBeenCalledWith(marketsContextEvent)
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining(
        "listener threw during 'subscription:marketsContext' fan-out"
      ),
      expect.any(Error)
    )
    errorLog.mockRestore()
  })
})

const flushAsync = () => new Promise<void>((r) => setTimeout(r, 0))

describe('WsProviderBase — reconnect recovery', () => {
  it('reconnect() is a no-op unless the socket is terminal disconnected', () => {
    const rws = new MockRws()
    const p = new TestProvider(rws)

    p.reconnect()
    expect(rws.reconnectCalls).toBe(0)

    rws.simulateStatus('disconnected')
    p.reconnect()
    expect(rws.reconnectCalls).toBe(1)
  })

  it('auto-heals a disconnected socket on subscribe and replays after open', async () => {
    const rws = new MockRws()
    rws.status = 'disconnected'
    const p = new TestProvider(rws)
    const onStatus = vi.fn()
    p.openImpl = async () => {
      await p.register('marketsContext', { id: 'marketsContext' })
      return vi.fn()
    }

    await p.subscribe(MARKETS_CONTEXT, vi.fn(), onStatus)

    expect(rws.reconnectCalls).toBe(1)
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting')
    expect(p.sendSubscribeSpy).not.toHaveBeenCalled()

    rws.simulateOpen()
    await flushAsync()
    expect(onStatus).toHaveBeenLastCalledWith('connected')
    expect(p.sendSubscribeSpy).toHaveBeenCalledTimes(1)
  })

  it('replays live subscriptions across repeated disconnect/recover cycles', async () => {
    const rws = new MockRws()
    rws.status = 'disconnected'
    const p = new TestProvider(rws)
    const onStatus = vi.fn()
    p.openImpl = async () => {
      await p.register('marketsContext', { id: 'marketsContext' })
      return vi.fn()
    }

    await p.subscribe(MARKETS_CONTEXT, vi.fn(), onStatus)
    rws.simulateOpen()
    await flushAsync()
    expect(p.sendSubscribeSpy).toHaveBeenCalledTimes(1)

    rws.simulateStatus('disconnected')
    p.reconnect()
    rws.simulateOpen()
    await flushAsync()
    expect(rws.reconnectCalls).toBe(2)
    expect(p.sendSubscribeSpy).toHaveBeenCalledTimes(2)
    expect(onStatus).toHaveBeenCalledWith('reconnecting')
    expect(onStatus).toHaveBeenLastCalledWith('connected')
  })
})

describe('WsProviderBase — wire-sub registry & replay', () => {
  it('sends exactly one subscribe frame per cycle across open→close→reopen', async () => {
    const rws = new MockRws() // starts 'connected'
    const p = new TestProvider(rws)
    p.openImpl = async () => {
      await p.register('marketsContext', { id: 'marketsContext' })
      return vi.fn()
    }

    await p.subscribe(MARKETS_CONTEXT, vi.fn())
    expect(p.sendSubscribeSpy).toHaveBeenCalledTimes(1)

    rws.simulateStatus('reconnecting')
    rws.simulateStatus('connected')
    rws.simulateOpen()
    await flushAsync()
    expect(p.sendSubscribeSpy).toHaveBeenCalledTimes(2)
    expect(p.sendSubscribeSpy).toHaveBeenNthCalledWith(2, {
      id: 'marketsContext',
    })
  })

  it('records but does not send while the socket is down; the open replay is the sole sender', async () => {
    const rws = new MockRws()
    rws.status = 'reconnecting'
    const p = new TestProvider(rws)

    await p.register('marketsContext', { id: 'marketsContext' })
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

    await p.register('marketsContext', { id: 'marketsContext' })
    p.unregister('marketsContext')

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

  it('does not send a registered sub after close() drives status to disconnected', async () => {
    const rws = new MockRws() // starts 'connected'
    const p = new TestProvider(rws)

    p.close()
    await p.register('marketsContext', { id: 'marketsContext' })

    expect(p.sendSubscribeSpy).not.toHaveBeenCalled()
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

describe('WsProviderBase — resubscribe replay races a concurrent subscribe', () => {
  const CHANNEL_C = {
    channel: 'trades',
    dex: 'test',
    marketId: 'BTC',
  } satisfies TradesSubscription

  /** Gate every `sendSubscribe` on a resolver the test releases explicitly. */
  const gateSends = (p: TestProvider): Array<() => void> => {
    const pending: Array<() => void> = []
    p.sendSubscribeSpy.mockReset()
    p.sendSubscribeSpy.mockImplementation(
      () => new Promise<void>((resolve) => pending.push(resolve))
    )
    return pending
  }

  const drain = async (pending: Array<() => void>): Promise<void> => {
    while (pending.length > 0) {
      for (const resolve of pending.splice(0)) {
        resolve()
      }
      await flushAsync()
    }
  }

  const idsSent = (p: TestProvider): string[] =>
    p.sendSubscribeSpy.mock.calls.map((call) => (call[0] as { id: string }).id)

  it('sends exactly one subscribe per channel when a subscribe lands mid-replay', async () => {
    const rws = new MockRws() // 'connected' — inline register sends immediately
    const p = new TestProvider(rws)
    await p.register('a', { id: 'a' })
    await p.register('b', { id: 'b' })

    const pending = gateSends(p)

    // Reconnect open → replaySubs parks awaiting the first entry's send.
    rws.simulateOpen()
    await flushAsync()

    // New channel while replay is suspended; status is 'connected', so
    // registerSub sends its frame inline.
    p.openImpl = async () => {
      await p.register('c', { id: 'c' })
      return vi.fn()
    }
    const subC = p.subscribe(CHANNEL_C, vi.fn())
    await flushAsync()

    await drain(pending)
    await subC

    const ids = idsSent(p)
    expect(ids.filter((id) => id === 'c')).toHaveLength(1)
    expect(ids.filter((id) => id === 'a')).toHaveLength(1)
    expect(ids.filter((id) => id === 'b')).toHaveLength(1)
  })

  it('does not send a subscribe for an entry unregistered mid-replay', async () => {
    const rws = new MockRws()
    const p = new TestProvider(rws)
    await p.register('a', { id: 'a' })
    await p.register('b', { id: 'b' })

    const pending = gateSends(p)

    rws.simulateOpen()
    await flushAsync()

    p.unregister('b')

    await drain(pending)

    const ids = idsSent(p)
    expect(ids).toContain('a')
    expect(ids).not.toContain('b')
  })
})
