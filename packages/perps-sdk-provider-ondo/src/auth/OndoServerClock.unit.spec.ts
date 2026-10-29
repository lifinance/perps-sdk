import { DISABLED_RETRY } from '@lifi/perps-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OndoApiClient } from '../utils/apiClient.js'
import { OndoServerClock } from './OndoServerClock.js'

const BASE_URL = 'https://api.ondoperps-sandbox.xyz'

const CLIENT_NOW_MS = Date.parse('2026-10-28T12:00:10.000Z')

// Ondo stamps the depth snapshot with nanoseconds. Live shape, 2026-10-28.
const SERVER_TIME = '2026-10-28T12:00:00.000123456Z'
const SERVER_TIME_MS = Date.parse('2026-10-28T12:00:00.000Z')

const depthResponse = (time: string): Response =>
  new Response(
    JSON.stringify({
      success: true,
      result: {
        market: 'BTC-USD.P',
        time,
        asks: [['80958', '0.0293']],
        bids: [['80931', '0.0123']],
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )

const failedResponse = (): Response =>
  new Response(
    JSON.stringify({ success: false, error: 'busy', error_code: 'unknown' }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  )

const clockWith = (fetchImpl: typeof fetch) =>
  new OndoServerClock(
    () => new OndoApiClient(BASE_URL, { fetchImpl, policy: DISABLED_RETRY })
  )

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(CLIENT_NOW_MS)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('OndoServerClock', () => {
  it('estimates the client clock before any sync', () => {
    const clock = clockWith(vi.fn<typeof fetch>())

    expect(clock.estimateServerTimeMs()).toBe(CLIENT_NOW_MS)
  })

  it('reads the server time from a one-level depth snapshot of the default market', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(depthResponse(SERVER_TIME))
    const clock = clockWith(fetchImpl)

    await clock.sync()

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/v1/perps/depth?market=BTC-USD.P&depth=1`)
    expect(init.method).toBe('GET')
  })

  it('estimates the server time when the client clock runs 10s ahead', async () => {
    const clock = clockWith(
      vi.fn<typeof fetch>().mockResolvedValue(depthResponse(SERVER_TIME))
    )

    await clock.sync()

    expect(clock.estimateServerTimeMs()).toBe(SERVER_TIME_MS)
    vi.setSystemTime(CLIENT_NOW_MS + 5_000)
    expect(clock.estimateServerTimeMs()).toBe(SERVER_TIME_MS + 5_000)
  })

  it('estimates the server time when the client clock runs behind', async () => {
    vi.setSystemTime(SERVER_TIME_MS - 20_000)
    const clock = clockWith(
      vi.fn<typeof fetch>().mockResolvedValue(depthResponse(SERVER_TIME))
    )

    await clock.sync()

    expect(clock.estimateServerTimeMs()).toBe(SERVER_TIME_MS)
  })

  it('reuses a measurement for one minute, then measures again', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(depthResponse(SERVER_TIME))
      .mockResolvedValueOnce(depthResponse('2026-10-28T12:01:05.123Z'))
    const clock = clockWith(fetchImpl)

    await clock.sync()
    vi.setSystemTime(CLIENT_NOW_MS + 59_999)
    await clock.sync()
    expect(fetchImpl).toHaveBeenCalledOnce()

    vi.setSystemTime(CLIENT_NOW_MS + 60_000)
    await clock.sync()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(clock.estimateServerTimeMs()).toBe(
      Date.parse('2026-10-28T12:01:05.123Z')
    )
  })

  it('shares one request between concurrent syncs', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(depthResponse(SERVER_TIME))
    const clock = clockWith(fetchImpl)

    await Promise.all([clock.sync(), clock.sync(), clock.sync()])

    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('keeps the client clock and warns once when the request fails, then measures on the next sync', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(failedResponse())
      .mockResolvedValueOnce(failedResponse())
      .mockResolvedValueOnce(depthResponse(SERVER_TIME))
    const clock = clockWith(fetchImpl)

    await expect(clock.sync()).resolves.toBeUndefined()
    await clock.sync()
    expect(clock.estimateServerTimeMs()).toBe(CLIENT_NOW_MS)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain(
      '[ondo] clock sync failed, signing with the client clock'
    )

    await clock.sync()
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(clock.estimateServerTimeMs()).toBe(SERVER_TIME_MS)
  })

  it('keeps the client clock and warns when the snapshot time is not a date', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const clock = clockWith(
      vi.fn<typeof fetch>().mockResolvedValue(depthResponse('not-a-time'))
    )

    await clock.sync()

    expect(clock.estimateServerTimeMs()).toBe(CLIENT_NOW_MS)
    expect(warn).toHaveBeenCalledWith(
      '[ondo] clock sync failed, signing with the client clock: invalid depth time'
    )
  })

  it('keeps the previous offset when a later measurement fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const clock = clockWith(
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(depthResponse(SERVER_TIME))
        .mockResolvedValueOnce(failedResponse())
    )

    await clock.sync()
    vi.setSystemTime(CLIENT_NOW_MS + 60_000)
    await clock.sync()

    expect(clock.estimateServerTimeMs()).toBe(SERVER_TIME_MS + 60_000)
  })
})
