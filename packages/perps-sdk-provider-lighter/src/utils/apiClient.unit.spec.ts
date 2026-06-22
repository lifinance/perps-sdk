import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { LighterApiClient, LighterAuthRejectedError } from './apiClient.js'

const BASE_URL = 'https://lighter.test'

/** A `fetch` stand-in returning a single fixed `{status, body}` response. */
const stubFetch =
  (status: number, body: unknown): typeof fetch =>
  async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })

const clientWith = (fetchImpl: typeof fetch): LighterApiClient =>
  new LighterApiClient(BASE_URL, {
    fetchImpl,
    policy: {
      enabled: false,
      maxAttempts: 1,
      baseDelayMs: 0,
      maxDelayMs: 0,
      respectRetryAfter: false,
      classify: () => 'fail',
    },
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
})
