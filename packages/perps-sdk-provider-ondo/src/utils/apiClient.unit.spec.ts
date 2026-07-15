import type { ResolvedRetryPolicy } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import type { OndoAuthToken, OndoGenericResponse } from '../types/auth.js'
import {
  OndoApiClient,
  OndoApiError,
  OndoSessionExpiredError,
} from './apiClient.js'

const BASE_URL = 'https://api.ondoperps-sandbox.xyz'

const AUTH_TOKEN_FIXTURE: OndoAuthToken = {
  identifier: '0x1111111111111111111111111111111111111111',
  authType: 'erc4361',
  accountId: 'acct-1',
  issuedAtSecs: 1_750_000_000,
  expirationSecs: 1_750_086_400,
  token: 'ondo-jwt-token',
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const envelope = <T>(result: T): OndoGenericResponse<T> => ({
  success: true,
  result,
})

const zeroDelayRetry: ResolvedRetryPolicy = {
  enabled: true,
  maxAttempts: 2,
  baseDelayMs: 0,
  maxDelayMs: 0,
  respectRetryAfter: false,
  classify: ({ response }) =>
    response.status === 503 ? 'retry-server' : 'fail',
}

const createClient = (
  responses: Response[],
  options?: { policy?: ResolvedRetryPolicy }
) => {
  const fetchImpl = vi.fn<typeof fetch>()
  for (const response of responses) {
    fetchImpl.mockResolvedValueOnce(response)
  }
  const client = new OndoApiClient(BASE_URL, {
    fetchImpl,
    policy: options?.policy ?? zeroDelayRetry,
  })
  return { client, fetchImpl }
}

const requestHeaders = (fetchImpl: ReturnType<typeof vi.fn>, call = 0) => {
  const init = fetchImpl.mock.calls[call]?.[1] as RequestInit | undefined
  return new Headers(init?.headers)
}

describe('OndoApiClient', () => {
  it('unwraps the GenericResponse envelope on GET', async () => {
    const { client, fetchImpl } = createClient([
      jsonResponse(envelope(AUTH_TOKEN_FIXTURE)),
    ])

    const result = await client.get<OndoAuthToken>('/v1/auth/whoami')

    expect(result).toEqual(AUTH_TOKEN_FIXTURE)
    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE_URL}/v1/auth/whoami`,
      expect.anything()
    )
  })

  it('appends URL-encoded query params on GET', async () => {
    const { client, fetchImpl } = createClient([jsonResponse(envelope([]))])

    await client.get('/v1/perps/orders', {
      params: { market: 'BTC/USDC', limit: 50 },
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE_URL}/v1/perps/orders?market=BTC%2FUSDC&limit=50`,
      expect.anything()
    )
  })

  it('trims a trailing slash from the base URL', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(envelope(null)))
    const client = new OndoApiClient(`${BASE_URL}/`, {
      fetchImpl,
      policy: zeroDelayRetry,
    })

    await client.get('/v1/perps/markets')

    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE_URL}/v1/perps/markets`,
      expect.anything()
    )
  })

  it('attaches Authorization: Bearer when an authToken is supplied', async () => {
    const { client, fetchImpl } = createClient([
      jsonResponse(envelope(null)),
      jsonResponse(envelope(null)),
    ])

    await client.get('/v1/perps/positions', { authToken: 'session-jwt' })
    await client.post(
      '/v1/perps/orders',
      { size: '1' },
      {
        authToken: 'session-jwt',
      }
    )

    expect(requestHeaders(fetchImpl, 0).get('authorization')).toBe(
      'Bearer session-jwt'
    )
    expect(requestHeaders(fetchImpl, 1).get('authorization')).toBe(
      'Bearer session-jwt'
    )
  })

  it('sends no Authorization header for anonymous calls', async () => {
    const { client, fetchImpl } = createClient([jsonResponse(envelope(null))])

    await client.get('/v1/perps/markets')

    expect(requestHeaders(fetchImpl).get('authorization')).toBeNull()
  })

  it('POSTs a JSON body with content-type and unwraps the result', async () => {
    const { client, fetchImpl } = createClient([
      jsonResponse(envelope(AUTH_TOKEN_FIXTURE)),
    ])

    const result = await client.post<OndoAuthToken>(
      '/v1/auth/erc-4361/login/complete_challenge',
      { id: 'challenge-1', signature: '0xsig' }
    )

    expect(result).toEqual(AUTH_TOKEN_FIXTURE)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/v1/auth/erc-4361/login/complete_challenge`)
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('content-type')).toBe(
      'application/json'
    )
    expect(JSON.parse(init.body as string)).toEqual({
      id: 'challenge-1',
      signature: '0xsig',
    })
  })

  it('throws OndoApiError carrying error_code when success is false', async () => {
    const { client } = createClient([
      jsonResponse({
        success: false,
        error: 'order size below minimum',
        error_code: 'ORDER_SIZE_TOO_SMALL',
      }),
    ])

    const promise = client.post('/v1/perps/orders', {})
    await expect(promise).rejects.toBeInstanceOf(OndoApiError)
    await expect(promise).rejects.toMatchObject({
      code: PerpsErrorCode.ThirdPartyError,
      errorCode: 'ORDER_SIZE_TOO_SMALL',
      message: expect.stringContaining('order size below minimum'),
    })
  })

  it('throws OndoApiError on a non-2xx HTTP status', async () => {
    const { client } = createClient([
      jsonResponse({ success: false, error: 'internal' }, 500),
    ])

    const promise = client.get('/v1/perps/markets')
    await expect(promise).rejects.toBeInstanceOf(OndoApiError)
    await expect(promise).rejects.toMatchObject({
      code: PerpsErrorCode.ThirdPartyError,
      message: expect.stringContaining('500'),
    })
  })

  it('throws OndoSessionExpiredError on HTTP 401', async () => {
    const { client } = createClient([
      jsonResponse({ success: false, error: 'token expired' }, 401),
    ])

    const promise = client.get('/v1/perps/positions', {
      authToken: 'stale-jwt',
    })
    await expect(promise).rejects.toBeInstanceOf(OndoSessionExpiredError)
    await expect(promise).rejects.toMatchObject({
      code: PerpsErrorCode.Unauthorized,
    })
  })

  it('throws OndoApiError when a 2xx body is not a GenericResponse envelope', async () => {
    const { client } = createClient([jsonResponse({ unexpected: true })])

    await expect(client.get('/v1/perps/markets')).rejects.toBeInstanceOf(
      OndoApiError
    )
  })

  it('returns the page result alongside pageInfo on getPage', async () => {
    const { client } = createClient([
      jsonResponse({
        success: true,
        result: [{ orderId: 'ord-1' }],
        pageInfo: { nextCursor: 'cur-2', prevCursor: 'cur-0' },
      }),
    ])

    const page = await client.getPage<{ orderId: string }>('/v1/perps/orders', {
      authToken: 'session-jwt',
    })

    expect(page.result).toEqual([{ orderId: 'ord-1' }])
    expect(page.pageInfo).toEqual({ nextCursor: 'cur-2', prevCursor: 'cur-0' })
  })

  it('normalizes a pageInfo-less page to an empty-cursor page', async () => {
    const { client } = createClient([
      jsonResponse({ success: true, result: [] }),
    ])

    const page = await client.getPage('/v1/perps/fills')

    expect(page.result).toEqual([])
    expect(page.pageInfo).toBeUndefined()
  })

  it('throws OndoApiError when getPage sees success: false', async () => {
    const { client } = createClient([
      jsonResponse({ success: false, error: 'nope', error_code: 'BAD' }),
    ])

    await expect(client.getPage('/v1/perps/orders')).rejects.toBeInstanceOf(
      OndoApiError
    )
  })

  it('sends arbitrary-method requests with prebuilt headers via send', async () => {
    const { client, fetchImpl } = createClient([
      jsonResponse(envelope({ orderId: 'ord-1' })),
    ])

    const result = await client.send<{ orderId: string }>(
      'POST',
      '/v1/perps/orders',
      {
        body: { market: 'AAPL-USD.P', size: '1' },
        headers: { Authorization: 'Bearer prebuilt-jwt' },
      }
    )

    expect(result).toEqual({ orderId: 'ord-1' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/v1/perps/orders`)
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer prebuilt-jwt'
    )
    expect(JSON.parse(init.body as string)).toEqual({
      market: 'AAPL-USD.P',
      size: '1',
    })
  })

  it('supports DELETE via send and never retries non-GET methods', async () => {
    const { client, fetchImpl } = createClient([
      jsonResponse({ success: false, error: 'unavailable' }, 503),
      jsonResponse(envelope(null)),
    ])

    await expect(
      client.send('DELETE', '/v1/perps/orders/ord-1', {
        headers: { Authorization: 'Bearer prebuilt-jwt' },
      })
    ).rejects.toBeInstanceOf(OndoApiError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((fetchImpl.mock.calls[0]?.[1] as RequestInit).method).toBe('DELETE')
  })

  it('retries GET on 503 per the injected policy', async () => {
    const { client, fetchImpl } = createClient([
      jsonResponse({ success: false, error: 'unavailable' }, 503),
      jsonResponse(envelope(AUTH_TOKEN_FIXTURE)),
    ])

    const result = await client.get<OndoAuthToken>('/v1/auth/whoami')

    expect(result).toEqual(AUTH_TOKEN_FIXTURE)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('never retries POST, even when the policy would', async () => {
    const { client, fetchImpl } = createClient([
      jsonResponse({ success: false, error: 'unavailable' }, 503),
      jsonResponse(envelope(AUTH_TOKEN_FIXTURE)),
    ])

    await expect(
      client.post('/v1/perps/orders', { size: '1' })
    ).rejects.toBeInstanceOf(OndoApiError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
