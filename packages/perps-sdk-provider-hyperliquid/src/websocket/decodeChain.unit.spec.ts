import { describe, expect, it, vi } from 'vitest'
import { DecodeChain } from './decodeChain.js'

const deferred = () => {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flushMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0))

/** Decode stub that records its start and blocks on a controllable gate. */
const gatedDecode = (ran: string[], label: string, gate: Promise<void>) =>
  vi.fn(async () => {
    ran.push(label)
    await gate
  })

describe('DecodeChain', () => {
  describe("'every' mode", () => {
    it('runs every decode, serialized in arrival order', async () => {
      const chain = new DecodeChain('every', () => {})
      const ran: string[] = []
      const gateA = deferred()

      const a = gatedDecode(ran, 'a', gateA.promise)
      const b = gatedDecode(ran, 'b', Promise.resolve())
      const c = gatedDecode(ran, 'c', Promise.resolve())

      chain.push(a)
      await flushMicrotasks()
      // b and c queue behind the still-pending a — the backlog case.
      chain.push(b)
      chain.push(c)
      await flushMicrotasks()
      expect(ran).toEqual(['a'])

      gateA.resolve()
      await flushMicrotasks()
      expect(ran).toEqual(['a', 'b', 'c'])
    })

    it('reports a decode failure and keeps the chain alive', async () => {
      const onError = vi.fn()
      const chain = new DecodeChain('every', onError)
      const ran: string[] = []
      const failure = new Error('bad frame')

      chain.push(async () => {
        throw failure
      })
      chain.push(gatedDecode(ran, 'next', Promise.resolve()))
      await flushMicrotasks()

      expect(onError).toHaveBeenCalledWith(failure)
      expect(ran).toEqual(['next'])
    })
  })

  describe("'latest' mode", () => {
    it('coalesces decodes queued behind an in-flight one to the newest', async () => {
      const chain = new DecodeChain('latest', () => {})
      const ran: string[] = []
      const gateA = deferred()

      const a = gatedDecode(ran, 'a', gateA.promise)
      const b = gatedDecode(ran, 'b', Promise.resolve())
      const c = gatedDecode(ran, 'c', Promise.resolve())
      const d = gatedDecode(ran, 'd', Promise.resolve())

      chain.push(a)
      await flushMicrotasks()
      expect(ran).toEqual(['a'])

      chain.push(b)
      chain.push(c)
      chain.push(d)
      gateA.resolve()
      await flushMicrotasks()

      expect(ran).toEqual(['a', 'd'])
      expect(b).not.toHaveBeenCalled()
      expect(c).not.toHaveBeenCalled()
    })

    it('coalesces a same-tick burst before the first decode starts', async () => {
      const chain = new DecodeChain('latest', () => {})
      const ran: string[] = []

      const a = gatedDecode(ran, 'a', Promise.resolve())
      const b = gatedDecode(ran, 'b', Promise.resolve())

      chain.push(a)
      chain.push(b)
      await flushMicrotasks()

      expect(ran).toEqual(['b'])
      expect(a).not.toHaveBeenCalled()
    })

    it('reports a decode failure and still runs the next push', async () => {
      const onError = vi.fn()
      const chain = new DecodeChain('latest', onError)
      const ran: string[] = []
      const failure = new Error('bad frame')

      chain.push(async () => {
        throw failure
      })
      await flushMicrotasks()
      chain.push(gatedDecode(ran, 'next', Promise.resolve()))
      await flushMicrotasks()

      expect(onError).toHaveBeenCalledWith(failure)
      expect(ran).toEqual(['next'])
    })

    it('reset drops the queued decode', async () => {
      const chain = new DecodeChain('latest', () => {})
      const ran: string[] = []
      const gateA = deferred()

      chain.push(gatedDecode(ran, 'a', gateA.promise))
      await flushMicrotasks()
      chain.push(gatedDecode(ran, 'b', Promise.resolve()))

      chain.reset()
      gateA.resolve()
      await flushMicrotasks()

      expect(ran).toEqual(['a'])
    })
  })
})
