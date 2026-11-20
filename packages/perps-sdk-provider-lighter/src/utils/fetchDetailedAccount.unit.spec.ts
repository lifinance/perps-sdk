import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { LIGHTER_CODE_ACCOUNT_NOT_FOUND } from '../constants.js'
import { LighterApiClient } from './apiClient.js'
import {
  createSharedAccountRead,
  fetchDetailedAccount,
} from './fetchDetailedAccount.js'

const ADDRESS = '0x1111111111111111111111111111111111111111' as const

const stubFetch =
  (status: number, body: unknown): typeof fetch =>
  async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })

const clientWith = (
  fetchImpl: typeof fetch,
  signal?: AbortSignal
): LighterApiClient =>
  new LighterApiClient('https://lighter.test', {
    fetchImpl,
    signal,
    policy: {
      enabled: false,
      maxAttempts: 1,
      baseDelayMs: 0,
      maxDelayMs: 0,
      respectRetryAfter: false,
      classify: () => 'fail',
    },
  })

describe('fetchDetailedAccount', () => {
  it('returns the first account on success', async () => {
    const client = clientWith(
      stubFetch(200, { code: 200, accounts: [{ index: 42 }, { index: 7 }] })
    )
    await expect(fetchDetailedAccount(client, ADDRESS)).resolves.toMatchObject({
      index: 42,
    })
  })

  it('throws AccountNotFound for the Lighter account-not-found body code', async () => {
    const client = clientWith(
      stubFetch(400, { code: LIGHTER_CODE_ACCOUNT_NOT_FOUND, message: 'nope' })
    )
    await expect(fetchDetailedAccount(client, ADDRESS)).rejects.toMatchObject({
      code: PerpsErrorCode.AccountNotFound,
    })
  })

  it('throws ThirdPartyError on other non-2xx statuses', async () => {
    const client = clientWith(stubFetch(500, { message: 'boom' }))
    await expect(fetchDetailedAccount(client, ADDRESS)).rejects.toMatchObject({
      code: PerpsErrorCode.ThirdPartyError,
      message: expect.stringContaining('500 — {"message":"boom"}'),
    })
  })

  it('throws ThirdPartyError with the status for a non-JSON non-2xx body', async () => {
    const client = clientWith(
      async () =>
        new Response('boom', {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        })
    )
    await expect(fetchDetailedAccount(client, ADDRESS)).rejects.toMatchObject({
      code: PerpsErrorCode.ThirdPartyError,
      message: expect.stringContaining('500 — non-JSON body'),
    })
  })

  it('throws AccountNotFound when the accounts list is empty', async () => {
    const client = clientWith(stubFetch(200, { code: 200, accounts: [] }))
    await expect(fetchDetailedAccount(client, ADDRESS)).rejects.toMatchObject({
      code: PerpsErrorCode.AccountNotFound,
    })
  })
})

describe('createSharedAccountRead', () => {
  const MIXED_CASE_ADDRESS =
    '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01' as const

  /**
   * Shared reads over a fetch that records each request at dispatch, holds its
   * answer until `release`, and rejects on abort, as `fetch` does.
   */
  const heldReads = (
    answer: () => Response = () =>
      new Response(JSON.stringify({ code: 200, accounts: [{ index: 42 }] }))
  ) => {
    const requestSignals: (AbortSignal | undefined)[] = []
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetchImpl: typeof fetch = (_input, init) => {
      const signal = init?.signal ?? undefined
      requestSignals.push(signal)
      return new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason))
        gate.then(() => resolve(answer()))
      })
    }
    const read = createSharedAccountRead((signal) =>
      clientWith(fetchImpl, signal)
    )
    return { read, requestSignals, release }
  }

  const flushReads = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, 0))

  it('shares one request among the reads of an address in any letter case', async () => {
    const { read, requestSignals, release } = heldReads()

    const reads = Promise.all([
      read(MIXED_CASE_ADDRESS),
      read(MIXED_CASE_ADDRESS.toLowerCase() as `0x${string}`),
    ])
    await flushReads()
    release()

    const [first, second] = await reads
    expect(second).toBe(first)
    expect(requestSignals).toHaveLength(1)
  })

  it('aborts the shared request only when every read with a signal aborts', async () => {
    const { read, requestSignals, release } = heldReads()
    const firstController = new AbortController()
    const secondController = new AbortController()

    const first = read(ADDRESS, firstController.signal)
    const second = read(ADDRESS, secondController.signal)
    await flushReads()
    firstController.abort(new Error('first left'))
    await expect(first).rejects.toThrow('first left')
    expect(requestSignals[0]?.aborted).toBe(false)

    secondController.abort(new Error('second left'))
    await expect(second).rejects.toThrow('second left')
    expect(requestSignals[0]?.aborted).toBe(true)

    release()
    await expect(read(ADDRESS)).resolves.toMatchObject({ index: 42 })
    expect(requestSignals).toHaveLength(2)
  })

  it('rejects a read with an aborted signal without a request', async () => {
    const { read, requestSignals } = heldReads()
    const reason = new Error('already left')

    await expect(read(ADDRESS, AbortSignal.abort(reason))).rejects.toBe(reason)
    expect(requestSignals).toHaveLength(0)
  })

  it.each([
    { order: 'first', keptJoinsFirst: true },
    { order: 'second', keptJoinsFirst: false },
  ])('keeps the shared request for a read without a signal that joins $order', async ({
    keptJoinsFirst,
  }) => {
    const { read, requestSignals, release } = heldReads()
    const controller = new AbortController()
    const reason = new Error('signalled read left')

    const first = keptJoinsFirst
      ? read(ADDRESS)
      : read(ADDRESS, controller.signal)
    const second = keptJoinsFirst
      ? read(ADDRESS, controller.signal)
      : read(ADDRESS)
    const [kept, aborted] = keptJoinsFirst ? [first, second] : [second, first]
    await flushReads()
    controller.abort(reason)

    await expect(aborted).rejects.toBe(reason)
    expect(requestSignals[0]?.aborted).toBe(false)
    release()
    await expect(kept).resolves.toMatchObject({ index: 42 })
    expect(requestSignals).toHaveLength(1)
  })

  it('gives every read with a signal the shared rejection, then sends a fresh request', async () => {
    const { read, requestSignals, release } = heldReads(
      () => new Response(JSON.stringify({ message: 'boom' }), { status: 500 })
    )

    const first = read(ADDRESS, new AbortController().signal)
    const second = read(ADDRESS, new AbortController().signal)
    await flushReads()
    release()

    const failure = await first.catch((error: unknown) => error)
    expect(failure).toMatchObject({ code: PerpsErrorCode.ThirdPartyError })
    await expect(second).rejects.toBe(failure)
    await expect(read(ADDRESS)).rejects.toMatchObject({
      code: PerpsErrorCode.ThirdPartyError,
    })
    expect(requestSignals).toHaveLength(2)
  })

  it('ignores an abort that comes after the shared read settles', async () => {
    const { read, requestSignals, release } = heldReads()
    const controller = new AbortController()

    const settled = read(ADDRESS, controller.signal)
    await flushReads()
    release()
    await expect(settled).resolves.toMatchObject({ index: 42 })

    const fresh = read(ADDRESS)
    controller.abort(new Error('late abort'))

    await expect(fresh).resolves.toMatchObject({ index: 42 })
    await expect(settled).resolves.toMatchObject({ index: 42 })
    expect(requestSignals.map((signal) => signal?.aborted)).toEqual([
      false,
      false,
    ])
  })
})
