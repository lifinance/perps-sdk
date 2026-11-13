import {
  type MarketContext,
  type MarketsContextEvent,
  type MarketsContextSubscription,
  PerpsErrorCode,
  type Subscription,
  type SubscriptionEvent,
  type TradesSubscription,
} from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PerpsError } from '../errors/PerpsError.js'
import type {
  ProviderGetQuoteParams,
  QuoteListener,
} from '../types/provider.js'
import type { ReconnectingWebSocket } from './ReconnectingWebSocket.js'
import type { SubscriptionListener, WsConnectionStatus } from './types.js'
import {
  WS_CHANNEL_TEARDOWN_LINGER_MS,
  WS_FRAME_ENRICHMENT_TIMEOUT_MS,
  WS_MARKETS_CONTEXT_INTERVAL_MS,
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
  offStatus(fn: (s: WsConnectionStatus) => void) {
    this.statusHandlers = this.statusHandlers.filter(
      (handler) => handler !== fn
    )
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
  openImpl: (sub: Subscription) => Promise<() => void> = async () =>
    vi.fn<() => void>()

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

  reject(key: string, error: unknown) {
    this.rejectChannel(key, error)
  }

  /** Test hook into the base's throttled `marketsContext` delivery. */
  pushMarketsContext(snapshot: () => Record<string, MarketContext>) {
    this.emitMarketsContext(snapshot)
  }

  /** Test hook into the base's protected optional frame read. */
  enrich<T>(label: string, read: (signal: AbortSignal) => Promise<T>) {
    return this.readFrameEnrichment(label, read)
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

describe('WsProviderBase — status-only observation', () => {
  it('observes a disconnected socket without recovery or a channel', () => {
    const rws = new MockRws()
    rws.status = 'disconnected'
    const p = new TestProvider(rws)
    const status = vi.fn()
    const baseline = rws.statusHandlers.length
    const first = p.subscribeStatus(status)
    const second = p.subscribeStatus(status)
    expect(rws.statusHandlers).toHaveLength(baseline + 2)

    expect(status.mock.calls).toEqual([['disconnected'], ['disconnected']])
    expect(rws.reconnectCalls).toBe(0)
    expect(p.openCount).toBe(0)
    first()
    first()
    expect(rws.statusHandlers).toHaveLength(baseline + 1)
    status.mockClear()
    p.reconnect()
    rws.simulateOpen()
    expect(status.mock.calls).toEqual([['reconnecting'], ['connected']])
    second()
    expect(rws.statusHandlers).toHaveLength(baseline)
    status.mockClear()
    rws.simulateStatus('disconnected')
    expect(status).not.toHaveBeenCalled()
    p.close()
  })

  it('removes observer resources on close without changing subscription status delivery', async () => {
    const rws = new MockRws()
    const p = new TestProvider(rws)
    const status = vi.fn()
    const dataStatus = vi.fn()
    const baseline = rws.statusHandlers.length
    p.subscribeStatus(status)
    await p.subscribe(MARKETS_CONTEXT, vi.fn(), dataStatus)
    p.close()
    expect(rws.statusHandlers).toHaveLength(baseline)
    expect(status).toHaveBeenLastCalledWith('disconnected')
    expect(dataStatus).toHaveBeenLastCalledWith('disconnected')
    status.mockClear()
    rws.simulateOpen()
    expect(status).not.toHaveBeenCalled()
  })
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

describe('WsProviderBase — subscription errors', () => {
  it('rejects an initial failure without calling the error listener', async () => {
    const p = new TestProvider(new MockRws())
    const error = new Error('open failed')
    p.openImpl = async () => {
      throw error
    }
    const onError = vi.fn()
    await expect(
      p.subscribe(MARKETS_CONTEXT, vi.fn(), undefined, onError)
    ).rejects.toBe(error)
    expect(onError).not.toHaveBeenCalled()
  })

  it('isolates late error listeners and stops data after rejection', async () => {
    const p = new TestProvider(new MockRws())
    const data = vi.fn()
    const onError = vi.fn()
    const teardown = vi.fn()
    p.openImpl = async () => teardown
    await p.subscribe(MARKETS_CONTEXT, data, undefined, () => {
      throw new Error('consumer failed')
    })
    await p.subscribe(MARKETS_CONTEXT, data, undefined, onError)
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('credential rejected')
    p.reject('marketsContext', error)
    p.reject('marketsContext', error)
    p.deliver('marketsContext', marketsContextEvent)
    expect(onError).toHaveBeenCalledExactlyOnceWith(error)
    expect(data).not.toHaveBeenCalled()
    expect(teardown).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('keeps shared error callbacks independent of idempotent releases', async () => {
    const p = new TestProvider(new MockRws())
    const data = vi.fn()
    const onError = vi.fn()
    const release = await p.subscribe(MARKETS_CONTEXT, data, undefined, onError)
    await p.subscribe(MARKETS_CONTEXT, data, undefined, onError)
    release()
    release()
    p.reject('marketsContext', new Error('rejected'))
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('does not let an old release remove a replacement channel', async () => {
    const p = new TestProvider(new MockRws())
    const release = await p.subscribe(MARKETS_CONTEXT, vi.fn())
    p.reject('marketsContext', new Error('rejected'))
    const data = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, data)
    release()
    p.deliver('marketsContext', marketsContextEvent)
    expect(data).toHaveBeenCalledTimes(1)
  })

  it('skips a sibling released by an error callback', async () => {
    const p = new TestProvider(new MockRws())
    let release = () => {}
    await p.subscribe(MARKETS_CONTEXT, vi.fn(), undefined, () => release())
    const onError = vi.fn()
    release = await p.subscribe(MARKETS_CONTEXT, vi.fn(), undefined, onError)
    p.reject('marketsContext', new Error('rejected'))
    expect(onError).not.toHaveBeenCalled()
  })

  it('rejects an in-flight opening once without calling onError', async () => {
    const p = new TestProvider(new MockRws())
    let resolve!: (teardown: () => void) => void
    p.openImpl = () =>
      new Promise((finish) => {
        resolve = finish
      })
    const onError = vi.fn()
    const opening = p.subscribe(MARKETS_CONTEXT, vi.fn(), undefined, onError)
    const error = new Error('rejected during open')
    p.reject('marketsContext', error)
    const teardown = vi.fn()
    resolve(teardown)
    await expect(opening).rejects.toBe(error)
    expect(onError).not.toHaveBeenCalled()
    expect(teardown).toHaveBeenCalledTimes(1)
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

  it('keeps a replacement subscription when an old open rejects after close', async () => {
    const p = new TestProvider(new MockRws())
    let rejectOpen!: (error: Error) => void
    p.openImpl = () =>
      new Promise<() => void>((_, reject) => {
        rejectOpen = reject
      })
    const opening = p.subscribe(MARKETS_CONTEXT, vi.fn())
    const rejected = expect(opening).rejects.toThrow('old open failed')
    p.close()

    p.openImpl = async () => vi.fn<() => void>()
    const listener = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, listener)
    rejectOpen(new Error('old open failed'))
    await rejected
    p.deliver('marketsContext', marketsContextEvent)

    expect(listener).toHaveBeenCalledWith(marketsContextEvent)
    p.close()
  })

  it('evicts the entry on a failed open so a later subscribe re-opens', async () => {
    const p = new TestProvider(new MockRws())
    p.openImpl = async () => {
      throw new Error('open failed')
    }
    await expect(p.subscribe(MARKETS_CONTEXT, vi.fn())).rejects.toThrow(
      'open failed'
    )

    p.openImpl = async () => vi.fn<() => void>()
    const listener = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, listener)
    expect(p.openCount).toBe(2)

    p.deliver('marketsContext', marketsContextEvent)
    expect(listener).toHaveBeenCalledWith(marketsContextEvent)
  })
})

describe('WsProviderBase — deferred teardown', () => {
  it('keeps replacement teardown ownership when an old open completes after close', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const oldTeardown = vi.fn()
    const teardown = vi.fn()
    let resolveOpen!: (release: () => void) => void
    p.openImpl = () =>
      new Promise<() => void>((resolve) => {
        resolveOpen = resolve
      })
    const opening = p.subscribe(MARKETS_CONTEXT, vi.fn())
    p.close()

    p.openImpl = async () => teardown
    const listener = vi.fn()
    const unsubscribe = await p.subscribe(MARKETS_CONTEXT, listener)
    resolveOpen(oldTeardown)
    await opening
    expect(oldTeardown).toHaveBeenCalledTimes(1)
    expect(teardown).not.toHaveBeenCalled()
    p.deliver('marketsContext', marketsContextEvent)
    expect(listener).toHaveBeenCalledWith(marketsContextEvent)

    unsubscribe()
    vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS)
    expect(oldTeardown).toHaveBeenCalledTimes(1)
    expect(teardown).toHaveBeenCalledTimes(1)
    p.close()
  })

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

describe('WsProviderBase — frame enrichment read', () => {
  it('gives the result of the read and clears its timer', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())

    await expect(p.enrich('leverage', async () => 'value')).resolves.toBe(
      'value'
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('gives undefined and warns when the read rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = new Error('read failed')
    const p = new TestProvider(new MockRws())

    await expect(
      p.enrich('leverage', () => Promise.reject(error))
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      '[test:ws] leverage read failed; the frame emits without it',
      error
    )
    warn.mockRestore()
  })

  it('aborts the read signal after the timeout and gives undefined', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = new TestProvider(new MockRws())
    let readSignal: AbortSignal | undefined
    const result = p.enrich(
      'leverage',
      (signal) =>
        new Promise((_resolve, reject) => {
          readSignal = signal
          signal.addEventListener('abort', () => reject(signal.reason))
        })
    )

    await vi.advanceTimersByTimeAsync(WS_FRAME_ENRICHMENT_TIMEOUT_MS - 1)
    expect(readSignal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    await expect(result).resolves.toBeUndefined()
    expect(readSignal?.reason).toMatchObject({ name: 'TimeoutError' })
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      '[test:ws] leverage read failed; the frame emits without it',
      readSignal?.reason
    )
    warn.mockRestore()
  })
})

describe('WsProviderBase — marketsContext delivery gap', () => {
  const context = (marketId: string, midPrice: string): MarketContext => ({
    provider: 'test',
    marketId,
    midPrice,
    markPrice: midPrice,
  })
  const dataOf = (listener: ReturnType<typeof vi.fn>) =>
    listener.mock.calls.map(([event]) => event.data)

  it('delivers the first snapshot at once and holds later ones until the gap ends', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const listener = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, listener)

    p.pushMarketsContext(() => ({ BTC: context('BTC', '1') }))
    expect(listener).toHaveBeenCalledTimes(1)

    p.pushMarketsContext(() => ({ BTC: context('BTC', '2') }))
    p.pushMarketsContext(() => ({ BTC: context('BTC', '3') }))
    vi.advanceTimersByTime(WS_MARKETS_CONTEXT_INTERVAL_MS - 1)
    expect(listener).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(dataOf(listener)).toEqual([
      { BTC: context('BTC', '1') },
      { BTC: context('BTC', '3') },
    ])
  })

  it('delivers at most one event per gap under a steady wire rate, then the newest when the wire stops', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const listener = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, listener)

    for (let tick = 1; tick <= 25; tick++) {
      p.pushMarketsContext(() => ({ BTC: context('BTC', String(tick)) }))
      vi.advanceTimersByTime(100)
    }
    // 2,500 ms elapsed: the immediate delivery, then the gap end at 1,000 ms
    // and at 2,000 ms.
    expect(listener).toHaveBeenCalledTimes(3)
    expect(dataOf(listener)).toEqual([
      { BTC: context('BTC', '1') },
      { BTC: context('BTC', '10') },
      { BTC: context('BTC', '20') },
    ])

    vi.advanceTimersByTime(WS_MARKETS_CONTEXT_INTERVAL_MS)
    expect(listener).toHaveBeenCalledTimes(4)
    expect(dataOf(listener).at(-1)).toEqual({ BTC: context('BTC', '25') })

    vi.advanceTimersByTime(WS_MARKETS_CONTEXT_INTERVAL_MS * 5)
    expect(listener).toHaveBeenCalledTimes(4)
  })

  it('runs the snapshot producer once per delivered event, not per call', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    await p.subscribe(MARKETS_CONTEXT, vi.fn())
    const snapshot = vi.fn(() => ({ BTC: context('BTC', '1') }))

    for (let call = 0; call < 10; call++) {
      p.pushMarketsContext(snapshot)
    }
    expect(snapshot).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(WS_MARKETS_CONTEXT_INTERVAL_MS)
    expect(snapshot).toHaveBeenCalledTimes(2)
  })

  it('never runs the snapshot producer while no listener holds the channel', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const snapshot = vi.fn(() => ({}))

    p.pushMarketsContext(snapshot)
    const unsubscribe = await p.subscribe(MARKETS_CONTEXT, vi.fn())
    unsubscribe()
    p.pushMarketsContext(snapshot)
    vi.advanceTimersByTime(WS_MARKETS_CONTEXT_INTERVAL_MS)

    expect(snapshot).not.toHaveBeenCalled()
  })

  it('drops a held snapshot when the last listener unsubscribes', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const listener = vi.fn()
    const unsubscribe = await p.subscribe(MARKETS_CONTEXT, listener)

    p.pushMarketsContext(() => ({ BTC: context('BTC', '1') }))
    p.pushMarketsContext(() => ({ BTC: context('BTC', '2') }))
    unsubscribe()
    vi.advanceTimersByTime(WS_MARKETS_CONTEXT_INTERVAL_MS * 2)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('drops a held snapshot on close()', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const listener = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, listener)

    p.pushMarketsContext(() => ({ BTC: context('BTC', '1') }))
    p.pushMarketsContext(() => ({ BTC: context('BTC', '2') }))
    p.close()
    vi.advanceTimersByTime(WS_MARKETS_CONTEXT_INTERVAL_MS * 2)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the gap for a listener that re-subscribes inside the linger', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const listener = vi.fn()
    const unsubscribe = await p.subscribe(MARKETS_CONTEXT, listener)

    p.pushMarketsContext(() => ({ BTC: context('BTC', '1') }))
    p.pushMarketsContext(() => ({ BTC: context('BTC', '2') }))
    unsubscribe()
    vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS - 1)
    await p.subscribe(MARKETS_CONTEXT, listener)
    expect(p.openCount).toBe(1)

    p.pushMarketsContext(() => ({ BTC: context('BTC', '3') }))
    vi.advanceTimersByTime(
      WS_MARKETS_CONTEXT_INTERVAL_MS - WS_CHANNEL_TEARDOWN_LINGER_MS
    )
    expect(listener).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(dataOf(listener)).toEqual([
      { BTC: context('BTC', '1') },
      { BTC: context('BTC', '3') },
    ])
  })

  it('ends the gap with the channel, so a fresh channel delivers at once', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const listener = vi.fn()
    const unsubscribe = await p.subscribe(MARKETS_CONTEXT, listener)

    p.pushMarketsContext(() => ({ BTC: context('BTC', '1') }))
    unsubscribe()
    vi.advanceTimersByTime(WS_CHANNEL_TEARDOWN_LINGER_MS)
    expect(vi.getTimerCount()).toBe(0)
    await p.subscribe(MARKETS_CONTEXT, listener)
    expect(p.openCount).toBe(2)

    p.pushMarketsContext(() => ({ BTC: context('BTC', '2') }))
    expect(listener).toHaveBeenCalledTimes(2)
    expect(dataOf(listener).at(-1)).toEqual({ BTC: context('BTC', '2') })
  })

  it('ends the gap when an idle channel is reclaimed inside the linger', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const unsubscribe = await p.subscribe(MARKETS_CONTEXT, vi.fn())

    p.pushMarketsContext(() => ({ BTC: context('BTC', '1') }))
    unsubscribe()
    expect(p.expireIdle('marketsContext')).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('leaves every other channel unlimited', async () => {
    vi.useFakeTimers()
    const p = new TestProvider(new MockRws())
    const listener = vi.fn()
    await p.subscribe(
      { channel: 'marketContext', dex: 'test', marketId: 'BTC' },
      listener
    )

    for (let tick = 1; tick <= 5; tick++) {
      p.deliver('marketContext', {
        channel: 'marketContext',
        data: context('BTC', String(tick)),
      })
    }

    expect(listener).toHaveBeenCalledTimes(5)
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
      return vi.fn<() => void>()
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
      return vi.fn<() => void>()
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
      return vi.fn<() => void>()
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

  it('keeps a replacement wire registered when an old send rejects after close', async () => {
    const rws = new MockRws()
    const p = new TestProvider(rws)
    let rejectSend!: (error: Error) => void
    p.sendSubscribeSpy.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectSend = reject
        })
    )
    const registering = p.register('marketsContext', { id: 'old' })
    const rejected = expect(registering).rejects.toThrow('old send failed')
    p.close()
    rws.simulateStatus('connected')
    await p.register('marketsContext', { id: 'replacement' })
    rejectSend(new Error('old send failed'))
    await rejected

    p.sendSubscribeSpy.mockClear()
    rws.simulateOpen()
    await flushAsync()
    expect(p.sendSubscribeSpy).toHaveBeenCalledWith({ id: 'replacement' })
    p.close()
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
      return vi.fn<() => void>()
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

describe('WsProviderBase — replay credential failure', () => {
  const TRADES = {
    channel: 'trades',
    dex: 'test',
    marketId: 'BTC',
  } satisfies TradesSubscription

  /** Register one wire per channel key, with a teardown that unregisters it. */
  const openPerChannel = (p: TestProvider, teardown = vi.fn()) => {
    p.openImpl = async (sub) => {
      await p.register(sub.channel, { id: sub.channel })
      return () => {
        p.unregister(sub.channel)
        teardown(sub.channel)
      }
    }
    return teardown
  }

  /** Make every replay send of `id` throw `error`. */
  const failSendOf = (p: TestProvider, id: string, error: unknown) => {
    p.sendSubscribeSpy.mockImplementation(async (state: { id: string }) => {
      if (state.id === id) {
        throw error
      }
    })
  }

  const reopen = async (rws: MockRws) => {
    rws.simulateStatus('reconnecting')
    rws.simulateOpen()
    await flushAsync()
  }

  it.each([
    PerpsErrorCode.SetupRequired,
    PerpsErrorCode.Unauthorized,
  ])('delivers a replay failure with code %s to the error listener, drops the wire, and keeps the sibling', async (code) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rws = new MockRws()
    const p = new TestProvider(rws)
    const teardown = openPerChannel(p)
    const data = vi.fn()
    const onError = vi.fn()
    const publicError = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, data, undefined, onError)
    await p.subscribe(TRADES, vi.fn(), undefined, publicError)
    const error = new PerpsError(code, 'credential missing')
    error.tool = 'test'
    failSendOf(p, 'marketsContext', error)
    p.sendSubscribeSpy.mockClear()

    await reopen(rws)

    expect(onError).toHaveBeenCalledExactlyOnceWith(error)
    expect(publicError).not.toHaveBeenCalled()
    expect(teardown).toHaveBeenCalledExactlyOnceWith('marketsContext')
    expect(p.sendSubscribeSpy).toHaveBeenCalledWith({ id: 'trades' })
    expect(log).not.toHaveBeenCalled()
    p.deliver('marketsContext', marketsContextEvent)
    expect(data).not.toHaveBeenCalled()

    p.sendSubscribeSpy.mockClear()
    await reopen(rws)
    await reopen(rws)
    expect(p.sendSubscribeSpy).toHaveBeenCalledTimes(2)
    expect(p.sendSubscribeSpy).not.toHaveBeenCalledWith({
      id: 'marketsContext',
    })
    expect(onError).toHaveBeenCalledTimes(1)
    log.mockRestore()
  })

  it.each([
    new Error('socket closed'),
    new PerpsError(PerpsErrorCode.ThirdPartyError, 'venue busy'),
  ])('logs a transient replay failure %o, keeps the wire registered, and sends no callback', async (error) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rws = new MockRws()
    const p = new TestProvider(rws)
    const teardown = openPerChannel(p)
    const onError = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, vi.fn(), undefined, onError)
    failSendOf(p, 'marketsContext', error)

    await reopen(rws)
    expect(onError).not.toHaveBeenCalled()
    expect(teardown).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("'marketsContext'"),
      error
    )

    p.sendSubscribeSpy.mockReset()
    await reopen(rws)
    expect(p.sendSubscribeSpy).toHaveBeenCalledExactlyOnceWith({
      id: 'marketsContext',
    })
    log.mockRestore()
  })

  it('keeps the sibling replay when the error listener throws', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rws = new MockRws()
    const p = new TestProvider(rws)
    openPerChannel(p)
    await p.subscribe(MARKETS_CONTEXT, vi.fn(), undefined, () => {
      throw new Error('consumer failed')
    })
    const siblingError = vi.fn()
    await p.subscribe(TRADES, vi.fn(), undefined, siblingError)
    failSendOf(
      p,
      'marketsContext',
      new PerpsError(PerpsErrorCode.SetupRequired, 'credential missing')
    )
    p.sendSubscribeSpy.mockClear()

    await reopen(rws)

    expect(p.sendSubscribeSpy).toHaveBeenCalledWith({ id: 'trades' })
    expect(siblingError).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('subscription-error:marketsContext'),
      expect.any(Error)
    )
    log.mockRestore()
  })

  it('rejects every channel the hook names for a shared wire', async () => {
    class SharedWireProvider extends TestProvider {
      protected override resolveChannelKeys(key: string): string[] {
        return key === 'shared' ? ['marketsContext', 'trades'] : [key]
      }
    }
    const rws = new MockRws()
    const p = new SharedWireProvider(rws)
    let registered = false
    p.openImpl = async () => {
      if (!registered) {
        registered = true
        await p.register('shared', { id: 'shared' })
      }
      return vi.fn<() => void>()
    }
    const errors = [vi.fn(), vi.fn()]
    await p.subscribe(MARKETS_CONTEXT, vi.fn(), undefined, errors[0])
    await p.subscribe(TRADES, vi.fn(), undefined, errors[1])
    const error = new PerpsError(PerpsErrorCode.Unauthorized, 'rejected')
    failSendOf(p, 'shared', error)

    await reopen(rws)

    expect(errors[0]).toHaveBeenCalledExactlyOnceWith(error)
    expect(errors[1]).toHaveBeenCalledExactlyOnceWith(error)
    p.sendSubscribeSpy.mockClear()
    await reopen(rws)
    expect(p.sendSubscribeSpy).not.toHaveBeenCalled()
  })

  it('sends no late callback to a listener released during the replay and does not restore it', async () => {
    const rws = new MockRws()
    const p = new TestProvider(rws)
    const teardown = openPerChannel(p)
    const onError = vi.fn()
    const release = await p.subscribe(
      MARKETS_CONTEXT,
      vi.fn(),
      undefined,
      onError
    )
    let rejectSend!: (error: unknown) => void
    p.sendSubscribeSpy.mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectSend = reject
        })
    )
    await reopen(rws)

    release()
    rejectSend(
      new PerpsError(PerpsErrorCode.SetupRequired, 'credential missing')
    )
    await flushAsync()

    expect(onError).not.toHaveBeenCalled()
    expect(teardown).toHaveBeenCalledTimes(1)
    p.sendSubscribeSpy.mockReset()
    await reopen(rws)
    expect(p.sendSubscribeSpy).not.toHaveBeenCalled()
  })

  it('sends no late callback when the client closes during the replay', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rws = new MockRws()
    const p = new TestProvider(rws)
    openPerChannel(p)
    const onError = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, vi.fn(), undefined, onError)
    let rejectSend!: (error: unknown) => void
    p.sendSubscribeSpy.mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectSend = reject
        })
    )
    await reopen(rws)

    p.close()
    rejectSend(new PerpsError(PerpsErrorCode.Unauthorized, 'rejected'))
    await flushAsync()

    expect(onError).not.toHaveBeenCalled()
    p.sendSubscribeSpy.mockReset()
    rws.simulateOpen()
    await flushAsync()
    expect(p.sendSubscribeSpy).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('does not reject a replacement channel when the old send fails after its wire was replaced', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rws = new MockRws()
    const p = new TestProvider(rws)
    openPerChannel(p)
    const release = await p.subscribe(MARKETS_CONTEXT, vi.fn())
    let rejectSend!: (error: unknown) => void
    p.sendSubscribeSpy.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectSend = reject
        })
    )
    await reopen(rws)

    release()
    expect(p.expireIdle('marketsContext')).toBe(true)
    const data = vi.fn()
    const onError = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, data, undefined, onError)
    rejectSend(new PerpsError(PerpsErrorCode.SetupRequired, 'stale credential'))
    await flushAsync()

    expect(onError).not.toHaveBeenCalled()
    p.deliver('marketsContext', marketsContextEvent)
    expect(data).toHaveBeenCalledTimes(1)
    p.sendSubscribeSpy.mockClear()
    await reopen(rws)
    expect(p.sendSubscribeSpy).toHaveBeenCalledExactlyOnceWith({
      id: 'marketsContext',
    })
    log.mockRestore()
  })

  it('lets a new subscribe after the failure register and stream again', async () => {
    const rws = new MockRws()
    const p = new TestProvider(rws)
    openPerChannel(p)
    let credential: string | undefined = 'token-1'
    p.sendSubscribeSpy.mockImplementation(async (state: { id: string }) => {
      if (state.id === 'marketsContext' && credential === undefined) {
        throw new PerpsError(PerpsErrorCode.SetupRequired, 'credential missing')
      }
    })
    const onError = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, vi.fn(), undefined, onError)
    credential = undefined
    await reopen(rws)
    expect(onError).toHaveBeenCalledTimes(1)

    credential = 'token-2'
    p.sendSubscribeSpy.mockClear()
    const data = vi.fn()
    const restoredError = vi.fn()
    await p.subscribe(MARKETS_CONTEXT, data, undefined, restoredError)

    expect(p.openCount).toBe(2)
    expect(p.sendSubscribeSpy).toHaveBeenCalledExactlyOnceWith({
      id: 'marketsContext',
    })
    p.deliver('marketsContext', marketsContextEvent)
    expect(data).toHaveBeenCalledTimes(1)
    await reopen(rws)
    expect(p.sendSubscribeSpy).toHaveBeenCalledTimes(2)
    expect(restoredError).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
