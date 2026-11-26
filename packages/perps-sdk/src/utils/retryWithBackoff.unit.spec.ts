import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { retryWithBackoff } from './retryWithBackoff.js'

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves with the first successful attempt and does not wait', async () => {
    const run = vi.fn().mockResolvedValue('ok')

    await expect(
      retryWithBackoff(run, { maxAttempts: 3, baseDelayMs: 100 })
    ).resolves.toBe('ok')
    expect(run).toHaveBeenCalledOnce()
  })

  it('doubles the delay before each retry', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockResolvedValue('ok')
    const result = retryWithBackoff(run, { maxAttempts: 3, baseDelayMs: 100 })

    await vi.advanceTimersByTimeAsync(99)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(199)
    expect(run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('rejects with the last error when the attempts run out', async () => {
    const last = new Error('last')
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(last)
    const result = retryWithBackoff(run, { maxAttempts: 2, baseDelayMs: 100 })
    const settled = expect(result).rejects.toBe(last)

    await vi.advanceTimersByTimeAsync(100)
    await settled
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('rejects at once when shouldRetry refuses the error', async () => {
    const error = new Error('final')
    const run = vi.fn().mockRejectedValue(error)
    const shouldRetry = vi.fn().mockReturnValue(false)

    await expect(
      retryWithBackoff(run, { maxAttempts: 3, baseDelayMs: 100, shouldRetry })
    ).rejects.toBe(error)
    expect(run).toHaveBeenCalledOnce()
    expect(shouldRetry).toHaveBeenCalledWith(error)
  })

  it('rejects with the abort reason when the signal aborts during a delay', async () => {
    const controller = new AbortController()
    const reason = new Error('stopped')
    const run = vi.fn().mockRejectedValue(new Error('failed'))
    const result = retryWithBackoff(run, {
      maxAttempts: 3,
      baseDelayMs: 100,
      signal: controller.signal,
    })
    const settled = expect(result).rejects.toBe(reason)

    await vi.advanceTimersByTimeAsync(50)
    controller.abort(reason)
    await settled
    expect(run).toHaveBeenCalledOnce()
  })

  it('does not run again after an attempt rejects with the abort reason', async () => {
    const controller = new AbortController()
    const reason = new Error('stopped')
    controller.abort(reason)
    const run = vi.fn().mockRejectedValue(reason)

    await expect(
      retryWithBackoff(run, {
        maxAttempts: 3,
        baseDelayMs: 100,
        signal: controller.signal,
      })
    ).rejects.toBe(reason)
    expect(run).toHaveBeenCalledOnce()
  })
})
