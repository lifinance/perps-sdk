import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LighterApiClient,
  LighterAuthRejectedError,
  LighterTokenRevokedError,
} from './apiClient.js'

const BASE_URL = 'https://lighter.test'

const stubResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** A `fetch` stand-in returning a single fixed `{status, body}` response. */
const stubFetch =
  (status: number, body: unknown): typeof fetch =>
  async () =>
    stubResponse(status, body)

const TEST_POLICY = {
  enabled: false,
  maxAttempts: 1,
  baseDelayMs: 0,
  maxDelayMs: 0,
  respectRetryAfter: false,
  classify: () => 'fail' as const,
}

const clientWith = (
  fetchImpl: typeof fetch,
  rateLimitHold?: { untilMs: number }
): LighterApiClient =>
  new LighterApiClient(BASE_URL, {
    fetchImpl,
    policy: TEST_POLICY,
    rateLimitHold,
  })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LighterApiClient.get (dual-channel error detection)', () => {
  it('throws ThirdPartyError when a 200 body carries an error code', async () => {
    const client = clientWith(
      stubFetch(200, { code: 20013, message: 'invalid auth string' })
    )
    await expect(client.get('/api/v1/account')).rejects.toMatchObject({
      code: PerpsErrorCode.ThirdPartyError,
    })
  })

  it('treats a 200 body with code:200 as success', async () => {
    const payload = { code: 200, accounts: [{ index: 42 }] }
    const client = clientWith(stubFetch(200, payload))
    await expect(client.get('/api/v1/account')).resolves.toEqual(payload)
  })

  it('treats a 200 body with code:0 as success', async () => {
    const payload = { code: 0, order_book_details: [] }
    const client = clientWith(stubFetch(200, payload))
    await expect(client.get('/api/v1/orderBookDetails')).resolves.toEqual(
      payload
    )
  })

  it('treats a 200 body with no code field as success', async () => {
    const payload = { trades: [] }
    const client = clientWith(stubFetch(200, payload))
    await expect(client.get('/api/v1/trades')).resolves.toEqual(payload)
  })

  it('throws ThirdPartyError on a non-2xx HTTP status', async () => {
    const client = clientWith(stubFetch(500, { message: 'boom' }))
    await expect(client.get('/api/v1/account')).rejects.toBeInstanceOf(
      PerpsError
    )
  })
})

describe('LighterApiClient.getAuthed (auth-rejection subclass)', () => {
  it('throws LighterAuthRejectedError on a 200 body with the invalid-auth code', async () => {
    const client = clientWith(
      stubFetch(200, { code: 20013, message: 'invalid auth string' })
    )
    await expect(
      client.getAuthed('/api/v1/accountLimits', 'tok')
    ).rejects.toBeInstanceOf(LighterAuthRejectedError)
  })

  it('throws LighterAuthRejectedError on a 401 HTTP status', async () => {
    const client = clientWith(stubFetch(401, { message: 'unauthorized' }))
    await expect(
      client.getAuthed('/api/v1/accountLimits', 'tok')
    ).rejects.toBeInstanceOf(LighterAuthRejectedError)
  })

  it.each([
    { status: 400, body: { code: 61006, message: 'revoked' } },
    { status: 200, body: { code: 61006, message: 'revoked' } },
  ])('throws LighterTokenRevokedError for $status with body code 61006', async ({
    status,
    body,
  }) => {
    const client = clientWith(stubFetch(status, body))
    await expect(
      client.getAuthed('/api/v1/accountLimits', 'tok')
    ).rejects.toBeInstanceOf(LighterTokenRevokedError)
  })

  it('throws ThirdPartyError (not TypeError) on a 200 body with a non-auth error code', async () => {
    const client = clientWith(
      stubFetch(200, { code: 21100, message: 'account not found' })
    )
    await expect(
      client.getAuthed('/api/v1/accountActiveOrders', 'tok')
    ).rejects.toMatchObject({ code: PerpsErrorCode.ThirdPartyError })
  })

  it('does not raise the non-auth body error as LighterAuthRejectedError', async () => {
    const client = clientWith(
      stubFetch(200, { code: 21100, message: 'account not found' })
    )
    await expect(
      client.getAuthed('/api/v1/accountActiveOrders', 'tok')
    ).rejects.not.toBeInstanceOf(LighterAuthRejectedError)
  })

  it('throws ThirdPartyError on a non-2xx HTTP status', async () => {
    const client = clientWith(stubFetch(500, { message: 'boom' }))
    await expect(
      client.getAuthed('/api/v1/accountLimits', 'tok')
    ).rejects.toBeInstanceOf(PerpsError)
  })

  it('returns the parsed body when the 200 response carries a success code', async () => {
    const payload = { code: 200, orders: [] }
    const client = clientWith(stubFetch(200, payload))
    await expect(
      client.getAuthed('/api/v1/accountActiveOrders', 'tok')
    ).resolves.toEqual(payload)
  })
})

describe('LighterApiClient rate-limit hold', () => {
  it('holds all requests for 60 seconds after a 429 without Retry-After', async () => {
    let now = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(stubResponse(429, { code: 23000 }))
      .mockResolvedValueOnce(stubResponse(200, { code: 0 }))
    const client = clientWith(fetchImpl)

    await expect(client.get('/first')).rejects.toBeInstanceOf(PerpsError)
    now += 59_999
    await expect(client.postForm('/held', { value: 1 })).rejects.toBeInstanceOf(
      PerpsError
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    now += 1
    await expect(client.get('/released')).resolves.toEqual({ code: 0 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('shares a hold between clients for one provider instance', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(stubResponse(429, { code: 23000 }))
    const rateLimitHold = { untilMs: 0 }
    const firstClient = clientWith(fetchImpl, rateLimitHold)
    const nextPollClient = clientWith(fetchImpl, rateLimitHold)

    await expect(firstClient.get('/first')).rejects.toBeInstanceOf(PerpsError)
    await expect(nextPollClient.get('/next-poll')).rejects.toBeInstanceOf(
      PerpsError
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('uses Retry-After instead of the default hold length', async () => {
    let now = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 23000 }), {
          status: 405,
          headers: {
            'content-type': 'application/json',
            'Retry-After': '2',
          },
        })
      )
      .mockResolvedValueOnce(stubResponse(200, { code: 0 }))
    const client = clientWith(fetchImpl)

    await expect(client.get('/first')).rejects.toBeInstanceOf(PerpsError)
    now += 1_999
    await expect(client.get('/held')).rejects.toBeInstanceOf(PerpsError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    now += 1
    await expect(client.get('/released')).resolves.toEqual({ code: 0 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not shorten an existing hold when a concurrent response arrives later', async () => {
    let now = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    let resolveFirst!: (response: Response) => void
    let resolveSecond!: (response: Response) => void
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve
    })
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecond = resolve
    })
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => firstResponse)
      .mockImplementationOnce(() => secondResponse)
      .mockResolvedValue(stubResponse(200, { code: 0 }))
    const client = clientWith(fetchImpl)

    const first = client.get('/first')
    const second = client.get('/second')
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    resolveFirst(stubResponse(429, { code: 23000 }))
    await expect(first).rejects.toBeInstanceOf(PerpsError)

    now += 1_000
    resolveSecond(
      new Response(JSON.stringify({ code: 23000 }), {
        status: 405,
        headers: {
          'content-type': 'application/json',
          'Retry-After': '1',
        },
      })
    )
    await expect(second).rejects.toBeInstanceOf(PerpsError)

    now += 2_000
    await expect(client.get('/held')).rejects.toBeInstanceOf(PerpsError)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
