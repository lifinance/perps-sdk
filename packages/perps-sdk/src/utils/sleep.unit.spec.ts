import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sleep } from './sleep.js'

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves after the requested delay', async () => {
    let resolved = false
    const promise = sleep(1000).then(() => {
      resolved = true
    })

    await vi.advanceTimersByTimeAsync(999)
    expect(resolved).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await promise
    expect(resolved).toBe(true)
  })

  it('resolves with undefined', async () => {
    const promise = sleep(0)
    await vi.advanceTimersByTimeAsync(0)
    await expect(promise).resolves.toBeUndefined()
  })

  it('does not resolve before the delay elapses', async () => {
    let resolved = false
    sleep(500).then(() => {
      resolved = true
    })

    await vi.advanceTimersByTimeAsync(499)
    expect(resolved).toBe(false)
  })
})
