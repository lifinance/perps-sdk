import { PerpsErrorCode } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import { PerpsError } from '../errors/PerpsError.js'
import { request } from './request.js'

const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'test-key',
})
const url = `${client.config.apiUrl}/test`

/** Helper: override GET /test with a JSON error response */
function mockErrorResponse(
  status: number,
  body: Record<string, unknown>
): void {
  server.use(http.get(url, () => HttpResponse.json(body, { status })))
}

/** Helper: override GET /test with a non-JSON response */
function mockNonJsonResponse(status: number, text: string): void {
  server.use(
    http.get(
      url,
      () =>
        new HttpResponse(text, {
          status,
          headers: { 'Content-Type': 'text/plain' },
        })
    )
  )
}

describe('request — error rehydration', () => {
  // ── Every PerpsErrorCode rehydrates faithfully ──

  const errorCodes: [string, PerpsErrorCode][] = [
    ['DefaultError', PerpsErrorCode.DefaultError],
    ['ServerError', PerpsErrorCode.ServerError],
    ['ValidationError', PerpsErrorCode.ValidationError],
    ['TimeoutError', PerpsErrorCode.TimeoutError],
    ['ThirdPartyError', PerpsErrorCode.ThirdPartyError],
    ['SDKError', PerpsErrorCode.SDKError],
    ['SignatureInvalid', PerpsErrorCode.SignatureInvalid],
    ['AgentUnauthorized', PerpsErrorCode.AgentUnauthorized],
    ['ExchangeRejected', PerpsErrorCode.ExchangeRejected],
    ['InsufficientMargin', PerpsErrorCode.InsufficientMargin],
    ['InsufficientBalance', PerpsErrorCode.InsufficientBalance],
    ['MarketNotFound', PerpsErrorCode.MarketNotFound],
    ['OrderNotFound', PerpsErrorCode.OrderNotFound],
    ['PositionNotFound', PerpsErrorCode.PositionNotFound],
    ['InvalidNonce', PerpsErrorCode.InvalidNonce],
    ['NonceAlreadyUsed', PerpsErrorCode.NonceAlreadyUsed],
    ['NonceExpired', PerpsErrorCode.NonceExpired],
    ['PayloadMismatch', PerpsErrorCode.PayloadMismatch],
    ['RouteNotFound', PerpsErrorCode.RouteNotFound],
  ]

  it.each(
    errorCodes
  )('rehydrates %s (code %i) from backend response', async (name, code) => {
    const message = `Test ${name} error`
    const tool = 'hyperliquid'
    mockErrorResponse(400, { code, message, tool })

    try {
      await request(client.config, url, { retries: 0 })
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(PerpsError)
      const e = error as PerpsError
      expect(e.code).toBe(code)
      expect(e.message).toBe(message)
      expect(e.tool).toBe(tool)
    }
  })

  it('rehydrates backend error without tool field (tool defaults to unknown)', async () => {
    mockErrorResponse(400, {
      code: PerpsErrorCode.ValidationError,
      message: 'Missing required field',
    })

    try {
      await request(client.config, url, { retries: 0 })
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as PerpsError
      expect(e.code).toBe(PerpsErrorCode.ValidationError)
      expect(e.message).toBe('Missing required field')
      expect(e.tool).toBe('unknown')
    }
  })

  // ── Edge cases: body does not match PerpsErrorBody ──

  it('falls back when response body is not JSON', async () => {
    mockNonJsonResponse(502, 'Bad Gateway')

    try {
      await request(client.config, url, { retries: 0 })
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as PerpsError
      expect(e.code).toBe(PerpsErrorCode.DefaultError)
      expect(e.message).toBe('Request failed with status code 502')
      expect(e.tool).toBe('unknown')
    }
  })

  it('falls back when response body is JSON but missing code field', async () => {
    mockErrorResponse(422, { message: 'some message', extra: true })

    try {
      await request(client.config, url, { retries: 0 })
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as PerpsError
      expect(e.code).toBe(PerpsErrorCode.DefaultError)
      expect(e.message).toBe('Request failed with status code 422')
      expect(e.tool).toBe('unknown')
    }
  })

  it('falls back when response body is JSON but missing message field', async () => {
    mockErrorResponse(400, { code: PerpsErrorCode.ValidationError })

    try {
      await request(client.config, url, { retries: 0 })
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as PerpsError
      expect(e.code).toBe(PerpsErrorCode.DefaultError)
      expect(e.message).toBe('Request failed with status code 400')
      expect(e.tool).toBe('unknown')
    }
  })

  it('falls back when response body is empty JSON object', async () => {
    mockErrorResponse(500, {})

    try {
      await request(client.config, url, { retries: 0 })
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as PerpsError
      expect(e.code).toBe(PerpsErrorCode.DefaultError)
      expect(e.message).toBe('Request failed with status code 500')
      expect(e.tool).toBe('unknown')
    }
  })

  it('falls back when response body has wrong types for code/message', async () => {
    mockErrorResponse(400, { code: 'not-a-number', message: 123 })

    try {
      await request(client.config, url, { retries: 0 })
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as PerpsError
      expect(e.code).toBe(PerpsErrorCode.DefaultError)
      expect(e.message).toBe('Request failed with status code 400')
      expect(e.tool).toBe('unknown')
    }
  })

  // ── Network errors ──

  it('wraps network errors as PerpsError with ServerError code', async () => {
    server.use(http.get(url, () => HttpResponse.error()))

    try {
      await request(client.config, url, { retries: 0 })
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as PerpsError
      expect(e).toBeInstanceOf(PerpsError)
      expect(e.code).toBe(PerpsErrorCode.ServerError)
    }
  })

  // ── Retry behavior ──

  it('retries 5xx errors before throwing', async () => {
    let attempts = 0
    server.use(
      http.get(url, () => {
        attempts++
        return HttpResponse.json(
          {
            code: PerpsErrorCode.ServerError,
            message: 'Internal error',
            tool: 'hyperliquid',
          },
          { status: 500 }
        )
      })
    )

    try {
      await request(client.config, url, { retries: 1 })
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as PerpsError
      expect(e.code).toBe(PerpsErrorCode.ServerError)
      expect(e.message).toBe('Internal error')
      expect(attempts).toBe(2) // original + 1 retry
    }
  })

  it('does not retry 4xx errors', async () => {
    let attempts = 0
    server.use(
      http.get(url, () => {
        attempts++
        return HttpResponse.json(
          {
            code: PerpsErrorCode.ValidationError,
            message: 'Bad request',
            tool: 'hyperliquid',
          },
          { status: 400 }
        )
      })
    )

    try {
      await request(client.config, url, { retries: 1 })
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as PerpsError
      expect(e.code).toBe(PerpsErrorCode.ValidationError)
      expect(attempts).toBe(1) // no retry
    }
  })
})
