import { describe, expect, it, vi } from 'vitest'
import { cachePromise } from './cachePromise.js'

function makeSlot<T>() {
  let value: Promise<T> | undefined
  return {
    read: () => value,
    write: (p: Promise<T> | undefined) => {
      value = p
    },
    get current() {
      return value
    },
  }
}

describe('cachePromise', () => {
  it('returns the cached promise on subsequent calls without re-running the factory', async () => {
    const slot = makeSlot<number>()
    const factory = vi.fn().mockResolvedValue(1)

    const a = cachePromise(slot.read, slot.write, factory)
    const b = cachePromise(slot.read, slot.write, factory)

    expect(a).toBe(b)
    expect(factory).toHaveBeenCalledOnce()
    expect(await a).toBe(1)
  })

  it('keeps a resolved promise cached', async () => {
    const slot = makeSlot<number>()
    const factory = vi.fn().mockResolvedValue(1)

    await cachePromise(slot.read, slot.write, factory)
    expect(slot.current).toBeDefined()
  })

  it('evicts a rejected promise so the next call retries', async () => {
    const slot = makeSlot<number>()
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(42)

    await expect(cachePromise(slot.read, slot.write, factory)).rejects.toThrow(
      'boom'
    )
    expect(slot.current).toBeUndefined()

    const retry = cachePromise(slot.read, slot.write, factory)
    expect(await retry).toBe(42)
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('propagates the rejection to every concurrent awaiter sharing the in-flight promise', async () => {
    const slot = makeSlot<number>()
    const factory = vi.fn().mockRejectedValue(new Error('boom'))

    const a = cachePromise(slot.read, slot.write, factory)
    const b = cachePromise(slot.read, slot.write, factory)

    expect(a).toBe(b)
    await expect(a).rejects.toThrow('boom')
    await expect(b).rejects.toThrow('boom')
    expect(factory).toHaveBeenCalledOnce()
  })

  it('does not evict a newer promise when an older rejected one settles', async () => {
    const slot = makeSlot<number>()
    let rejectFirst!: (err: Error) => void
    const first = new Promise<number>((_, reject) => {
      rejectFirst = reject
    })

    cachePromise(slot.read, slot.write, () => first).catch(() => {})
    const firstPromise = slot.current

    slot.write(undefined)
    const second = cachePromise(slot.read, slot.write, () => Promise.resolve(7))

    rejectFirst(new Error('late'))
    await firstPromise?.catch(() => {})

    expect(slot.current).toBe(second)
    expect(await second).toBe(7)
  })
})
