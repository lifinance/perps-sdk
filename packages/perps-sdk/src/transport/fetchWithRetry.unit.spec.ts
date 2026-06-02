import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest'
import { fetchWithRetry } from './fetchWithRetry.js'
import { LIFI_RETRY_DEFAULTS, type ResolvedRetryPolicy } from './retryPolicy.js'

const okResponse = () => new Response('ok', { status: 200 })

const errorResponse = (status: number, headers?: HeadersInit) =>
  new Response(null, { status, headers })

const policy = (
  overrides: Partial<ResolvedRetryPolicy> = {}
): ResolvedRetryPolicy => ({
  ...LIFI_RETRY_DEFAULTS,
  ...overrides,
})

/**
 * The retry layer schedules its backoff through `sleep`, which reaches the
 * platform via `setTimeout`. Spying on `setTimeout` lets us read the exact
 * delay each attempt requested without mocking the code under test.
 */
let setTimeoutSpy: MockInstance

const scheduledDelays = () =>
  setTimeoutSpy.mock.calls
    .map((call) => call[1])
    .filter((ms): ms is number => typeof ms === 'number')

beforeEach(() => {
  vi.useFakeTimers()
  setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('fetchWithRetry — abort handling', () => {
  it('short-circuits without an attempt when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = vi.fn(async () => okResponse())

    await expect(
      fetchWithRetry('https://x', undefined, {
        policy: policy(),
        fetchImpl,
        signal: controller.signal,
      })
    ).rejects.toBeInstanceOf(DOMException)

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('throws the signal reason when one is provided', async () => {
    const controller = new AbortController()
    const reason = new Error('user cancelled')
    controller.abort(reason)
    const fetchImpl = vi.fn(async () => okResponse())

    await expect(
      fetchWithRetry('https://x', undefined, {
        policy: policy(),
        fetchImpl,
        signal: controller.signal,
      })
    ).rejects.toBe(reason)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('fetchWithRetry — classification', () => {
  it('returns immediately on a 2xx without retrying', async () => {
    const response = okResponse()
    const fetchImpl = vi.fn(async () => response)

    const result = await fetchWithRetry('https://x', undefined, {
      policy: policy(),
      fetchImpl,
    })

    expect(result).toBe(response)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries a network rejection as retry-network up to the attempt budget', async () => {
    const networkError = new TypeError('Failed to fetch')
    const fetchImpl = vi.fn(async () => {
      throw networkError
    })
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const promise = fetchWithRetry('https://x', undefined, {
      policy: policy({ maxAttempts: 3 }),
      fetchImpl,
    })
    const assertion = expect(promise).rejects.toBe(networkError)
    await vi.runAllTimersAsync()
    await assertion

    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('rethrows the network error after exhausting retries', async () => {
    const networkError = new TypeError('boom')
    const fetchImpl = vi.fn(async () => {
      throw networkError
    })
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const promise = fetchWithRetry('https://x', undefined, {
      policy: policy({ maxAttempts: 2 }),
      fetchImpl,
    })
    const assertion = expect(promise).rejects.toBe(networkError)
    await vi.runAllTimersAsync()
    await assertion
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('returns the response without retrying when classification is fail', async () => {
    const response = errorResponse(400)
    const fetchImpl = vi.fn(async () => response)

    const result = await fetchWithRetry('https://x', undefined, {
      policy: policy(),
      fetchImpl,
    })

    expect(result).toBe(response)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries a 503 then returns the eventual 200', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(okResponse())

    const promise = fetchWithRetry('https://x', undefined, {
      policy: policy({ maxAttempts: 3 }),
      fetchImpl,
    })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('returns the last failing response after exhausting retries on 5xx', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fetchImpl = vi.fn(async () => errorResponse(503))

    const promise = fetchWithRetry('https://x', undefined, {
      policy: policy({ maxAttempts: 2 }),
      fetchImpl,
    })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.status).toBe(503)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('fetchWithRetry — shouldRetry gate', () => {
  it('stops retrying and returns the response when shouldRetry returns false', async () => {
    const shouldRetry = vi.fn(() => false)
    const fetchImpl = vi.fn(async () => errorResponse(503))

    const result = await fetchWithRetry('https://x', undefined, {
      policy: policy({ maxAttempts: 3, shouldRetry }),
      fetchImpl,
    })

    expect(result.status).toBe(503)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(shouldRetry).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 0, classification: 'retry-server' })
    )
  })

  it('rethrows the network error when shouldRetry returns false', async () => {
    const networkError = new TypeError('down')
    const shouldRetry = vi.fn(() => false)
    const fetchImpl = vi.fn(async () => {
      throw networkError
    })

    await expect(
      fetchWithRetry('https://x', undefined, {
        policy: policy({ maxAttempts: 3, shouldRetry }),
        fetchImpl,
      })
    ).rejects.toBe(networkError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

// Exercises the private computeDelay through the exported surface.
describe('computeDelay (via fetchWithRetry)', () => {
  it('applies exponential backoff with full jitter bounded by the capped window', async () => {
    // Math.random at its supremum (~1) yields the largest jitter; the delay
    // must still stay strictly below the capped exponential window.
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    const fetchImpl = vi.fn(async () => errorResponse(503))

    const promise = fetchWithRetry('https://x', undefined, {
      policy: policy({ maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 5_000 }),
      fetchImpl,
    })
    await vi.runAllTimersAsync()
    await promise

    // attempt 0 → cap 100, attempt 1 → cap 200, attempt 2 → cap 400.
    const delays = scheduledDelays()
    expect(delays).toHaveLength(3)
    expect(delays[0]).toBeLessThan(100)
    expect(delays[0]).toBeGreaterThanOrEqual(0)
    expect(delays[1]).toBeLessThan(200)
    expect(delays[1]).toBeGreaterThanOrEqual(100)
    expect(delays[2]).toBeLessThan(400)
    expect(delays[2]).toBeGreaterThanOrEqual(200)
  })

  it('caps the exponential window at maxDelayMs', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    const fetchImpl = vi.fn(async () => errorResponse(503))

    const promise = fetchWithRetry('https://x', undefined, {
      policy: policy({ maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 2_000 }),
      fetchImpl,
    })
    await vi.runAllTimersAsync()
    await promise

    // Windows: 1000, 2000, capped 2000, capped 2000 → all jittered < 2000.
    for (const delay of scheduledDelays()) {
      expect(delay).toBeLessThan(2_000)
    }
  })

  it('retries with no scheduled timer when the jittered delay is zero', async () => {
    // Math.random 0 → floor(0 * window) === 0; fetchWithRetry skips sleep
    // entirely (no setTimeout) yet still performs the retry.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(okResponse())

    const promise = fetchWithRetry('https://x', undefined, {
      policy: policy({ maxAttempts: 2, baseDelayMs: 500 }),
      fetchImpl,
    })
    await vi.runAllTimersAsync()
    await promise

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(scheduledDelays()).toEqual([])
  })
})

// Exercises the private parseRetryAfter + the Retry-After branch of computeDelay.
describe('Retry-After handling (via fetchWithRetry)', () => {
  it('honours a numeric Retry-After (seconds → ms) over backoff', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(okResponse())

    const promise = fetchWithRetry('https://x', undefined, {
      policy: policy({
        maxAttempts: 3,
        respectRetryAfter: true,
        maxDelayMs: 60_000,
      }),
      fetchImpl,
    })
    await vi.runAllTimersAsync()
    await promise

    expect(scheduledDelays()).toEqual([2_000])
  })

  it('caps Retry-After at maxDelayMs', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(429, { 'Retry-After': '120' }))
      .mockResolvedValueOnce(okResponse())

    const promise = fetchWithRetry('https://x', undefined, {
      policy: policy({
        maxAttempts: 3,
        respectRetryAfter: true,
        maxDelayMs: 5_000,
      }),
      fetchImpl,
    })
    await vi.runAllTimersAsync()
    await promise

    expect(scheduledDelays()).toEqual([5_000])
  })

  it('parses an HTTP-date Retry-After as ms-until-date', async () => {
    const now = new Date('2026-06-02T00:00:00.000Z')
    vi.setSystemTime(now)
    const future = new Date(now.getTime() + 3_000).toUTCString()
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(503, { 'Retry-After': future }))
      .mockResolvedValueOnce(okResponse())

    const promise = fetchWithRetry('https://x', undefined, {
      policy: policy({
        maxAttempts: 3,
        respectRetryAfter: true,
        maxDelayMs: 60_000,
      }),
      fetchImpl,
    })
    await vi.runAllTimersAsync()
    await promise

    // toUTCString drops sub-second precision; the delay is the whole-second remainder.
    expect(scheduledDelays()).toEqual([3_000])
  })

  it('clamps an HTTP-date Retry-After in the past to zero', async () => {
    const now = new Date('2026-06-02T00:00:00.000Z')
    vi.setSystemTime(now)
    const past = new Date(now.getTime() - 10_000).toUTCString()
    // Non-zero jitter: had the backoff path run, a non-zero timer would be
    // scheduled. Observing no timer proves the past date clamped to 0.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(503, { 'Retry-After': past }))
      .mockResolvedValueOnce(okResponse())

    const promise = fetchWithRetry('https://x', undefined, {
      policy: policy({
        maxAttempts: 3,
        respectRetryAfter: true,
        baseDelayMs: 500,
        maxDelayMs: 60_000,
      }),
      fetchImpl,
    })
    await vi.runAllTimersAsync()
    await promise

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(scheduledDelays()).toEqual([])
  })

  it('falls back to jittered backoff when Retry-After is malformed', async () => {
    // Non-zero jitter so the backoff delay is observable and distinct from
    // any Retry-After-derived value.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        errorResponse(503, { 'Retry-After': 'not-a-date' })
      )
      .mockResolvedValueOnce(okResponse())

    const promise = fetchWithRetry('https://x', undefined, {
      policy: policy({
        maxAttempts: 3,
        respectRetryAfter: true,
        baseDelayMs: 500,
        maxDelayMs: 5_000,
      }),
      fetchImpl,
    })
    await vi.runAllTimersAsync()
    await promise

    // Malformed header → parseRetryAfter undefined → backoff window of 500.
    expect(scheduledDelays()).toEqual([250])
  })

  it('ignores Retry-After when respectRetryAfter is false', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(429, { 'Retry-After': '30' }))
      .mockResolvedValueOnce(okResponse())

    const promise = fetchWithRetry('https://x', undefined, {
      policy: policy({
        maxAttempts: 3,
        respectRetryAfter: false,
        baseDelayMs: 500,
        maxDelayMs: 5_000,
      }),
      fetchImpl,
    })
    await vi.runAllTimersAsync()
    await promise

    // Retry-After '30' (30_000ms) is ignored; the backoff window of 500 wins.
    expect(scheduledDelays()).toEqual([250])
  })
})
