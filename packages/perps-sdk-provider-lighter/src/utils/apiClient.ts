import {
  fetchWithRetry,
  PerpsError,
  type ResolvedRetryPolicy,
} from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import {
  LIGHTER_INVALID_AUTH_CODE,
  LIGHTER_SUCCESS_CODES,
  LIGHTER_TOKEN_REVOKED_CODE,
} from '../constants.js'

/** @internal */
export type ApiParams = Record<string, string | number | boolean>

/**
 * Lighter signals errors on two channels: a non-2xx HTTP status, or an HTTP 200
 * carrying an error `code` in the JSON body. Returns the body error `code` when
 * the body advertises one that is not a success code, else `undefined`.
 */
const lighterBodyErrorCode = (data: unknown): number | undefined => {
  const code = (data as { code?: number } | undefined)?.code
  if (code === undefined || LIGHTER_SUCCESS_CODES.has(code)) {
    return undefined
  }
  return code
}

/**
 * Auth-gated read whose token format Lighter rejected.
 *
 * @internal
 */
export class LighterAuthRejectedError extends PerpsError {}

/**
 * Auth-gated read whose read-only token Lighter reports as revoked.
 *
 * @internal
 */
export class LighterTokenRevokedError extends PerpsError {}

const isLighterAuthRejection = (status: number, data: unknown): boolean =>
  status === 401 ||
  status === 403 ||
  lighterBodyErrorCode(data) === LIGHTER_INVALID_AUTH_CODE

const isLighterTokenRevoked = (data: unknown): boolean =>
  lighterBodyErrorCode(data) === LIGHTER_TOKEN_REVOKED_CODE

/** @internal */
export const LIGHTER_RETRY_DEFAULTS: ResolvedRetryPolicy = {
  enabled: true,
  maxAttempts: 2,
  baseDelayMs: 10_000,
  maxDelayMs: 60_000,
  respectRetryAfter: true,
  classify: ({ response }) => {
    if (
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {
      return 'retry-server'
    }
    return 'fail'
  },
}

const LIGHTER_RATE_LIMIT_HOLD_MS = 60_000
const LIGHTER_RATE_LIMIT_HOLD_MAX_MS = 300_000

const isLighterRateLimit = (status: number): boolean =>
  status === 429 || status === 405

const retryAfterMs = (header: string | null, nowMs: number): number => {
  if (header === null) {
    return LIGHTER_RATE_LIMIT_HOLD_MS
  }
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, LIGHTER_RATE_LIMIT_HOLD_MAX_MS)
  }
  const dateMs = Date.parse(header)
  return Number.isFinite(dateMs)
    ? Math.min(Math.max(0, dateMs - nowMs), LIGHTER_RATE_LIMIT_HOLD_MAX_MS)
    : LIGHTER_RATE_LIMIT_HOLD_MS
}

/**
 * Mutable rate-limit deadline shared by the request clients for one provider
 * instance. A client creates an isolated hold when the caller omits this.
 *
 * @internal
 */
export interface LighterRateLimitHold {
  untilMs: number
}

/** @internal */
export interface LighterApiClientOptions {
  signal?: AbortSignal
  policy?: ResolvedRetryPolicy
  fetchImpl?: typeof fetch
  rateLimitHold?: LighterRateLimitHold
}

/**
 * HTTP boundary against Lighter's REST API.
 *
 * Browser-direct by design: no LI.FI backend hop, no caching shim — caller
 * supplies the REST base URL, the path, and any query params, and we return
 * the parsed JSON body. Lighter advertises CORS headers on every public
 * endpoint so a vanilla `fetch` from the widget works.
 *
 * Auth-gated endpoints (accountLimits, accountActiveOrders, deposit/history,
 * withdraw/history, positionFunding, liquidations, transfer/history) take the
 * Lighter read-only token as the `auth` query parameter — NOT as an
 * `Authorization` header. This matches Lighter's OpenAPI spec and lets the
 * same call work browser-direct and from server-side proxies.
 *
 * Lighter signals rate limits through HTTP 429 or HTTP 405. This client never
 * retries such a response. It throws `RateLimitExceeded` and holds all network
 * dispatch until `Retry-After` expires (capped at five minutes), or for 60
 * seconds when the response has no valid header.
 * @public
 */
export class LighterApiClient {
  private readonly baseUrl: string
  private readonly signal: AbortSignal | undefined
  private readonly policy: ResolvedRetryPolicy
  private readonly fetchImpl: typeof fetch | undefined
  private readonly rateLimitHold: LighterRateLimitHold
  private readonly fetchWithHold: typeof fetch

  constructor(baseUrl: string, options?: LighterApiClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.signal = options?.signal
    this.policy = options?.policy ?? LIGHTER_RETRY_DEFAULTS
    this.fetchImpl = options?.fetchImpl
    this.rateLimitHold = options?.rateLimitHold ?? { untilMs: 0 }
    this.fetchWithHold = async (input, init) => {
      this.assertRequestAllowed()
      const response = await (this.fetchImpl ?? fetch)(input, init)
      if (isLighterRateLimit(response.status)) {
        const responseNowMs = Date.now()
        this.rateLimitHold.untilMs = Math.max(
          this.rateLimitHold.untilMs,
          responseNowMs +
            retryAfterMs(response.headers.get('Retry-After'), responseNowMs)
        )
      }
      return response
    }
  }

  /**
   * Send a single request through this client's rate-limit hold.
   *
   * @internal
   */
  request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return this.fetchWithHold(input, init)
  }

  private rateLimitError(): PerpsError {
    return new PerpsError(
      PerpsErrorCode.RateLimitExceeded,
      `Lighter API requests are held until ${new Date(this.rateLimitHold.untilMs).toISOString()}`
    )
  }

  private assertRequestAllowed(): void {
    if (Date.now() < this.rateLimitHold.untilMs) {
      throw this.rateLimitError()
    }
  }

  private assertNotRateLimited(response: Response): void {
    if (isLighterRateLimit(response.status)) {
      throw this.rateLimitError()
    }
  }
  private buildUrl(path: string, params?: ApiParams): string {
    const url = `${this.baseUrl}${path}`
    if (!params || Object.keys(params).length === 0) {
      return url
    }
    const qs = Object.entries(params)
      .map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
      )
      .join('&')
    return `${url}?${qs}`
  }

  async get<T>(path: string, params?: ApiParams): Promise<T> {
    return this.getChecked<T>(path, params)
  }

  /**
   * Auth-gated GET. The token is appended as the `auth` query parameter (per
   * Lighter's OpenAPI spec); the `Authorization` header is intentionally NOT
   * used — Lighter rejects it.
   */
  async getAuthed<T>(
    path: string,
    authToken: string,
    params: ApiParams = {}
  ): Promise<T> {
    const { status, data } = await this.getWithStatus<unknown>(path, {
      ...params,
      auth: authToken,
    })
    if (isLighterTokenRevoked(data)) {
      throw new LighterTokenRevokedError(
        PerpsErrorCode.ThirdPartyError,
        `Lighter reports a revoked auth token for ${path}`
      )
    }
    if (isLighterAuthRejection(status, data)) {
      throw new LighterAuthRejectedError(
        PerpsErrorCode.ThirdPartyError,
        `Lighter rejected the auth token for ${path}`
      )
    }
    this.assertOk(path, status, data)
    return data as T
  }

  /**
   * GET that surfaces the raw `{status, body}` pair without throwing on
   * non-2xx — used for endpoints (account lookup by L1 address) where the
   * caller distinguishes specific Lighter error codes from generic failures.
   */
  async getWithStatus<T>(
    path: string,
    params?: ApiParams
  ): Promise<{ status: number; data: T }> {
    this.assertRequestAllowed()
    const url = this.buildUrl(path, params)
    const response = await fetchWithRetry(
      url,
      {},
      {
        policy: this.policy,
        fetchImpl: this.fetchWithHold,
        signal: this.signal,
      }
    )
    this.assertNotRateLimited(response)
    const data = (await response.json().catch(() => undefined)) as T
    return { status: response.status, data }
  }

  /**
   * Form-encoded POST to a Lighter mutation endpoint. Single-shot — never
   * retried, since these are money/state writes whose outcome is unknown on a
   * transport failure. Surfaces the raw `{status, body}` pair so the caller can
   * map Lighter's per-endpoint business-rule `code` to a domain error verbatim.
   */
  async postForm<T>(
    path: string,
    params: ApiParams
  ): Promise<{ status: number; data: T }> {
    const body = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      body.set(k, String(v))
    }
    const response = await this.fetchWithHold(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: this.signal,
    })
    this.assertNotRateLimited(response)
    const data = (await response.json().catch(() => undefined)) as T
    return { status: response.status, data }
  }

  private async getChecked<T>(path: string, params?: ApiParams): Promise<T> {
    const { status, data } = await this.getWithStatus<unknown>(path, params)
    this.assertOk(path, status, data)
    return data as T
  }

  /**
   * Post-parse validation shared by every checked read: rejects a non-2xx HTTP
   * status and a 200 body carrying a non-success `code`. Callers that surface a
   * distinct auth-rejection error must run that check before this one.
   */
  private assertOk(path: string, status: number, data: unknown): void {
    if (status < 200 || status >= 300) {
      throw new PerpsError(
        PerpsErrorCode.ThirdPartyError,
        `Lighter API request failed: ${status} — ${JSON.stringify(data).slice(0, 200)}`
      )
    }
    const errorCode = lighterBodyErrorCode(data)
    if (errorCode !== undefined) {
      throw new PerpsError(
        PerpsErrorCode.ThirdPartyError,
        `Lighter API error for ${path}: code ${errorCode} — ${JSON.stringify(data).slice(0, 200)}`
      )
    }
  }
}
