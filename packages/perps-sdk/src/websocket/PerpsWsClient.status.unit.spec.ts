import type { Subscription } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockProviders, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import type {
  ProviderGetQuoteParams,
  QuoteListener,
} from '../types/provider.js'
import { PerpsWsClient } from './PerpsWsClient.js'
import { ReconnectingWebSocket } from './ReconnectingWebSocket.js'
import {
  WS_CHANNEL_TEARDOWN_LINGER_MS,
  WsProviderBase,
} from './WsProviderBase.js'

const { Socket } = vi.hoisted(() => {
  class Socket {
    static OPEN = 1
    static instances: Socket[] = []
    readyState = 0
    retryCount = 0
    reconnectCalls = 0
    sent: string[] = []
    onopen: (() => void) | null = null
    onclose: ((event: { code: number; reason: string }) => void) | null = null
    onerror = null
    onmessage = null

    constructor() {
      Socket.instances.push(this)
    }
    send(data: string) {
      this.sent.push(data)
    }
    close() {
      this.readyState = 3
    }
    reconnect() {
      this.reconnectCalls++
      this.retryCount = 0
    }
    open() {
      this.readyState = Socket.OPEN
      this.onopen?.()
    }
    drop() {
      this.readyState = 3
      this.retryCount = 1
      this.onclose?.({ code: 1006, reason: '' })
    }
  }
  return { Socket }
})

vi.mock('partysocket/ws', () => ({ default: Socket }))

class Provider extends WsProviderBase<string> {
  opens = 0
  teardowns = 0
  subscribeQuote(_params: ProviderGetQuoteParams, _listener: QuoteListener) {
    return this.subscribe({ channel: 'marketsContext', dex: 'test' }, () => {})
  }
  protected toKey(sub: Subscription) {
    return sub.channel
  }
  protected async openChannel(sub: Subscription) {
    this.opens++
    await this.registerSub(sub.channel, sub.channel)
    return () => {
      this.teardowns++
      this.unregisterSub(sub.channel)
    }
  }
  protected sendSubscribe(channel: string) {
    this.rws.send(channel)
  }
  protected handleMessage() {}
}

function createFixture() {
  Socket.instances = []
  const instances: Provider[] = []
  const requests: string[] = []
  const factory = Object.assign(
    ({ provider, wsUrl }: { provider: string; wsUrl: string }) => {
      const instance = new Provider(
        new ReconnectingWebSocket(wsUrl, { maxRetries: 1 }),
        provider
      )
      instances.push(instance)
      return instance
    },
    { streamsCandles: false, streamsAvailableToTrade: false }
  )
  server.use(
    http.get(`${DEFAULT_API_URL}/providers`, () => {
      requests.push('providers')
      return HttpResponse.json({
        providers: ['hyperliquid', 'lighter', 'ondo'].map((key) => ({
          ...mockProviders.providers[0],
          key,
          wsUrl: `wss://${key}.example/ws`,
        })),
      })
    })
  )
  const ws = new PerpsWsClient(createPerpsClient({}), {
    wsProviders: { hyperliquid: factory, lighter: factory, ondo: factory },
  })
  return { ws, instances, requests }
}

/** Tracks the status handlers that remain registered on every real socket. */
function trackSocketStatusHandlers() {
  const on = vi.spyOn(ReconnectingWebSocket.prototype, 'onStatus')
  const off = vi.spyOn(ReconnectingWebSocket.prototype, 'offStatus')
  return () =>
    on.mock.calls.filter(
      ([handler]) => !off.mock.calls.some(([removed]) => removed === handler)
    ).length
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PerpsWsClient status-only observation', () => {
  it('reports absence without discovery, provider creation, or socket demand', async () => {
    const { ws, instances, requests } = createFixture()
    const statuses: unknown[] = []
    for (let i = 0; i < 3; i++) {
      const release = ws.subscribeStatus('hyperliquid', (s) => statuses.push(s))
      release()
      release()
    }
    const releaseUnknown = ws.subscribeStatus('unknown', (s) =>
      statuses.push(s)
    )
    releaseUnknown()
    await Promise.resolve()
    expect(statuses).toEqual([null, null, null, null])
    expect(requests).toEqual([])
    expect(instances).toEqual([])
    expect(Socket.instances).toEqual([])
    ws.close()
  })

  it.each([
    'hyperliquid',
    'lighter',
    'ondo',
  ])('follows later %s creation and isolates other provider keys', async (dex) => {
    const { ws, instances } = createFixture()
    const statuses = vi.fn()
    const other = vi.fn()
    ws.subscribeStatus(dex, statuses)
    ws.subscribeStatus('unknown', other)
    await ws.subscribe({ channel: 'marketsContext', dex }, vi.fn())
    expect(statuses.mock.calls).toEqual([[null], ['reconnecting']])
    Socket.instances[0].open()
    expect(statuses).toHaveBeenLastCalledWith('connected')
    expect(other.mock.calls).toEqual([[null]])
    expect(instances[0].opens).toBe(1)
    expect(Socket.instances[0].sent).toEqual(['marketsContext'])
    ws.close()
  })

  it('keeps transitions separate between two initialized providers', async () => {
    const { ws } = createFixture()
    const hyperliquid = vi.fn()
    const lighter = vi.fn()
    ws.subscribeStatus('hyperliquid', hyperliquid)
    ws.subscribeStatus('lighter', lighter)
    await ws.subscribe(
      { channel: 'marketsContext', dex: 'hyperliquid' },
      vi.fn()
    )
    await ws.subscribe({ channel: 'marketsContext', dex: 'lighter' }, vi.fn())
    Socket.instances[0].open()
    expect(hyperliquid).toHaveBeenLastCalledWith('connected')
    expect(lighter.mock.calls).toEqual([[null], ['reconnecting']])
    Socket.instances[1].open()
    Socket.instances[0].drop()
    expect(hyperliquid).toHaveBeenLastCalledWith('reconnecting')
    expect(lighter.mock.calls).toEqual([
      [null],
      ['reconnecting'],
      ['connected'],
    ])
    ws.close()
  })

  it('reports current status without reconnect and releases identical callbacks independently', async () => {
    const liveHandlers = trackSocketStatusHandlers()
    const { ws, instances } = createFixture()
    const dataStatus = vi.fn()
    const unsubscribe = await ws.subscribe(
      { channel: 'marketsContext', dex: 'hyperliquid' },
      vi.fn(),
      dataStatus
    )
    const socket = Socket.instances[0]
    socket.open()
    socket.drop()
    socket.drop()
    const status = vi.fn()
    const baseline = liveHandlers()
    const first = ws.subscribeStatus('hyperliquid', status)
    const second = ws.subscribeStatus('hyperliquid', status)
    expect(liveHandlers()).toBe(baseline + 2)
    expect(status.mock.calls).toEqual([['disconnected'], ['disconnected']])
    expect(socket.reconnectCalls).toBe(0)
    first()
    first()
    expect(liveHandlers()).toBe(baseline + 1)
    status.mockClear()
    ws.reconnect('hyperliquid')
    socket.open()
    expect(status.mock.calls).toEqual([['reconnecting'], ['connected']])
    expect(dataStatus).toHaveBeenLastCalledWith('connected')
    expect(instances[0].opens).toBe(1)
    expect(instances[0].teardowns).toBe(0)
    second()
    expect(liveHandlers()).toBe(baseline)
    status.mockClear()
    socket.drop()
    expect(status).not.toHaveBeenCalled()
    expect(dataStatus).toHaveBeenLastCalledWith('reconnecting')
    unsubscribe()
    ws.close()
  })

  it('does not retain a released observer when a quote consumer creates the provider', async () => {
    const { ws, instances } = createFixture()
    const released = vi.fn()
    ws.subscribeStatus('hyperliquid', released)()
    const active = vi.fn()
    ws.subscribeStatus('hyperliquid', active)
    await ws.subscribeQuote(
      {
        provider: 'hyperliquid',
        symbol: 'BTC',
        side: 'buy',
        size: '1',
        type: 'perps',
      },
      vi.fn()
    )
    Socket.instances[0].open()
    expect(released.mock.calls).toEqual([[null]])
    expect(active.mock.calls).toEqual([[null], ['reconnecting'], ['connected']])
    expect(instances[0].opens).toBe(1)
    ws.close()
  })

  it('does not hold a data channel after its last real consumer releases', async () => {
    const { ws, instances } = createFixture()
    const status = vi.fn()
    ws.subscribeStatus('hyperliquid', status)
    const unsubscribe = await ws.subscribe(
      { channel: 'marketsContext', dex: 'hyperliquid' },
      vi.fn()
    )
    vi.useFakeTimers()
    unsubscribe()
    await vi.advanceTimersByTimeAsync(WS_CHANNEL_TEARDOWN_LINGER_MS)
    expect(instances[0].teardowns).toBe(1)
    Socket.instances[0].open()
    expect(status).toHaveBeenLastCalledWith('connected')
    expect(Socket.instances[0].sent).toEqual([])
    ws.close()
  })

  it('releases observers on close and rejects registration after close', async () => {
    const liveHandlers = trackSocketStatusHandlers()
    const { ws } = createFixture()
    const status = vi.fn()
    const release = ws.subscribeStatus('hyperliquid', status)
    await ws.subscribe(
      { channel: 'marketsContext', dex: 'hyperliquid' },
      vi.fn()
    )
    const attached = liveHandlers()
    ws.close()
    expect(liveHandlers()).toBe(attached - 1)
    status.mockClear()
    Socket.instances[0].open()
    expect(status).not.toHaveBeenCalled()
    expect(() => ws.subscribeStatus('hyperliquid', status)).toThrow(
      'PerpsWsClient is closed'
    )
    expect(() => release()).not.toThrow()
  })

  it('does not restore observers or create sockets after close during discovery', async () => {
    const { ws, instances } = createFixture()
    let finish!: () => void
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    server.use(
      http.get(`${DEFAULT_API_URL}/providers`, async () => {
        await gate
        return HttpResponse.json({ providers: [] })
      })
    )
    const status = vi.fn()
    const release = ws.subscribeStatus('hyperliquid', status)
    const pending = ws.subscribe(
      { channel: 'marketsContext', dex: 'hyperliquid' },
      vi.fn()
    )
    ws.close()
    finish()
    await expect(pending).rejects.toThrow('PerpsWsClient is closed')
    release()
    expect(status.mock.calls).toEqual([[null]])
    expect(instances).toEqual([])
    expect(Socket.instances).toEqual([])
  })

  it('isolates callback failures from provider initialization and sibling observers', async () => {
    const { ws } = createFixture()
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stable = vi.fn()
    ws.subscribeStatus('hyperliquid', () => {
      throw new Error('observer failed')
    })
    ws.subscribeStatus('hyperliquid', stable)
    await ws.subscribe(
      { channel: 'marketsContext', dex: 'hyperliquid' },
      vi.fn()
    )
    Socket.instances[0].open()
    expect(stable.mock.calls).toEqual([[null], ['reconnecting'], ['connected']])
    ws.close()
    errorLog.mockRestore()
  })

  it('isolates a provider status registration failure from data demand and sibling observers', async () => {
    const { ws, instances } = createFixture()
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(Provider.prototype, 'subscribeStatus').mockImplementationOnce(
      () => {
        throw new Error('status registration failed')
      }
    )
    const failed = vi.fn()
    const stable = vi.fn()
    ws.subscribeStatus('hyperliquid', failed)
    ws.subscribeStatus('hyperliquid', stable)
    await ws.subscribe(
      { channel: 'marketsContext', dex: 'hyperliquid' },
      vi.fn()
    )
    Socket.instances[0].open()
    expect(failed.mock.calls).toEqual([[null]])
    expect(stable.mock.calls).toEqual([[null], ['reconnecting'], ['connected']])
    expect(instances[0].opens).toBe(1)
    expect(errorLog).toHaveBeenCalledWith(
      '[hyperliquid:ws] status observer registration failed',
      expect.any(Error)
    )
    ws.close()
  })

  it('does not attach resources when an initial provider status callback closes the client', async () => {
    const { ws, instances } = createFixture()
    ws.subscribeStatus('hyperliquid', (status) => {
      if (status !== null) {
        ws.close()
      }
    })
    await expect(
      ws.subscribe({ channel: 'marketsContext', dex: 'hyperliquid' }, vi.fn())
    ).rejects.toThrow('PerpsWsClient is closed')
    expect(instances[0].opens).toBe(0)
    expect(Socket.instances[0].readyState).toBe(3)
  })

  it('attaches a registration inside a status callback once and skips released siblings', async () => {
    const { ws } = createFixture()
    const nested = vi.fn()
    const sibling = vi.fn()
    let releaseSibling = () => {}
    let registered = false
    ws.subscribeStatus('hyperliquid', (status) => {
      if (status !== null && !registered) {
        registered = true
        releaseSibling()
        ws.subscribeStatus('hyperliquid', nested)
      }
    })
    releaseSibling = ws.subscribeStatus('hyperliquid', sibling)
    await ws.subscribe(
      { channel: 'marketsContext', dex: 'hyperliquid' },
      vi.fn()
    )
    Socket.instances[0].open()
    expect(nested.mock.calls).toEqual([['reconnecting'], ['connected']])
    expect(sibling.mock.calls).toEqual([[null]])
    ws.close()
  })
})
