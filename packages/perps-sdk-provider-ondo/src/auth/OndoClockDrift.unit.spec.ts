import {
  createMemoryStorage,
  DISABLED_RETRY,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OndoApiClient } from '../utils/apiClient.js'
import { OndoClockDrift } from './OndoClockDrift.js'

const BASE_URL = 'https://api.ondoperps-sandbox.xyz'
const STORAGE_KEY = 'lifi-perps-ondo-clock-drift:api.ondoperps-sandbox.xyz'

const DEVICE_NOW_MS = Date.parse('2026-11-05T12:00:10.000Z')

// Live shape, 2026-11-05.
const statusResponse = (serverTime: unknown): Response =>
  new Response(
    JSON.stringify({
      success: true,
      result: { marketStatus: 'open', serverTime },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )

const failedResponse = (): Response =>
  new Response(
    JSON.stringify({ success: false, error: 'busy', error_code: 'unknown' }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  )

const driftWith = (
  fetchImpl: typeof fetch,
  storage: StorageAdapter = createMemoryStorage()
) =>
  new OndoClockDrift(
    storage,
    BASE_URL,
    () => new OndoApiClient(BASE_URL, { fetchImpl, policy: DISABLED_RETRY })
  )

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(DEVICE_NOW_MS)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('OndoClockDrift', () => {
  it('stamps the device clock and reads no status before any measurement', async () => {
    const fetchImpl = vi.fn<typeof fetch>()

    await expect(driftWith(fetchImpl).nowMs()).resolves.toBe(DEVICE_NOW_MS)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reads serverTime from the public status endpoint', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(statusResponse(DEVICE_NOW_MS))

    await driftWith(fetchImpl).measure()

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/status`)
    expect(init.method).toBe('GET')
  })

  it('stores a negative drift when the device clock runs 10s ahead', async () => {
    const storage = createMemoryStorage()
    const drift = driftWith(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(statusResponse(DEVICE_NOW_MS - 10_000)),
      storage
    )

    await expect(drift.measure()).resolves.toBe(true)

    await expect(drift.nowMs()).resolves.toBe(DEVICE_NOW_MS - 10_000)
    await expect(storage.get(STORAGE_KEY)).resolves.toBe('-10000')
  })

  it('stores a positive drift when the device clock runs 12s behind', async () => {
    const storage = createMemoryStorage()
    const drift = driftWith(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(statusResponse(DEVICE_NOW_MS + 12_000)),
      storage
    )

    await drift.measure()

    await expect(drift.nowMs()).resolves.toBe(DEVICE_NOW_MS + 12_000)
    await expect(storage.get(STORAGE_KEY)).resolves.toBe('12000')
  })

  it('replaces the drift on a new measurement instead of adding to it', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(statusResponse(DEVICE_NOW_MS - 10_000))
      .mockResolvedValueOnce(statusResponse(DEVICE_NOW_MS - 3_000))
    const drift = driftWith(fetchImpl)

    await drift.measure()
    await drift.measure()

    await expect(drift.nowMs()).resolves.toBe(DEVICE_NOW_MS - 3_000)
  })

  it('stamps a stored drift from an earlier provider instance', async () => {
    const storage = createMemoryStorage()
    await storage.set(STORAGE_KEY, '-1275')

    await expect(
      driftWith(vi.fn<typeof fetch>(), storage).nowMs()
    ).resolves.toBe(DEVICE_NOW_MS - 1_275)
  })

  it('stamps the device clock when the stored drift is not a number', async () => {
    const storage = createMemoryStorage()
    await storage.set(STORAGE_KEY, 'not-a-number')

    await expect(
      driftWith(vi.fn<typeof fetch>(), storage).nowMs()
    ).resolves.toBe(DEVICE_NOW_MS)
  })

  it('keeps the drift and the stored value, and warns once, when the status read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = createMemoryStorage()
    await storage.set(STORAGE_KEY, '-1275')
    const drift = driftWith(
      vi.fn<typeof fetch>().mockImplementation(async () => failedResponse()),
      storage
    )

    await expect(drift.measure()).resolves.toBe(false)
    await expect(drift.measure()).resolves.toBe(false)

    await expect(drift.nowMs()).resolves.toBe(DEVICE_NOW_MS - 1_275)
    await expect(storage.get(STORAGE_KEY)).resolves.toBe('-1275')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain(
      '[ondo] clock drift measurement failed, keeping the previous drift'
    )
  })

  it('keeps the drift and warns when serverTime is not a number', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const drift = driftWith(
      vi.fn<typeof fetch>().mockResolvedValue(statusResponse(null))
    )

    await expect(drift.measure()).resolves.toBe(false)

    await expect(drift.nowMs()).resolves.toBe(DEVICE_NOW_MS)
    expect(warn).toHaveBeenCalledWith(
      '[ondo] clock drift measurement failed, keeping the previous drift: invalid serverTime'
    )
  })
})
