import {
  DISABLED_RETRY,
  errorCodeFromStatus,
  fetchWithRetry,
  PerpsError,
  type ResolvedRetryPolicy,
} from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { EXTENDED_USER_AGENT } from '../constants.js'
import { parseVenueJson } from './parseVenueJson.js'

/** @internal */
export type ExtendedHttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/**
 * Extended answered with a failure: a non-2xx status or an `ERROR` envelope.
 * `code` is `ExchangeRejected`, `Unauthorized` or `RateLimitExceeded` when
 * Extended refused the request, and `ThirdPartyError` when the outcome stays
 * open (a 5xx, or a 2xx without an `OK` envelope).
 *
 * @public
 */
export class ExtendedApiError extends PerpsError {
  /** Extended's numeric error code, for example `1140`, when the body has one. */
  readonly venueCode: number | undefined
  readonly httpStatus: number

  constructor(
    message: string,
    httpStatus: number,
    venueCode: number | undefined,
    code: PerpsErrorCode
  ) {
    super(code, message)
    this.httpStatus = httpStatus
    this.venueCode = venueCode
  }
}

/** @internal */
export const EXTENDED_RETRY_DEFAULTS: ResolvedRetryPolicy = {
  enabled: true,
  maxAttempts: 2,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  respectRetryAfter: true,
  classify: ({ response }) => {
    if (response.status === 429) {
      return 'retry-rate-limit'
    }
    if ([502, 503, 504].includes(response.status)) {
      return 'retry-server'
    }
    return 'fail'
  },
}

/** @internal */
export interface ExtendedApiClientOptions {
  signal?: AbortSignal
  policy?: ResolvedRetryPolicy
  fetchImpl?: typeof fetch
}

/** @internal */
export interface ExtendedRequestOptions {
  body?: unknown
  /** The account's API key, sent as `X-Api-Key`. */
  apiKey?: string
  headers?: Record<string, string>
}

interface ExtendedEnvelope {
  status?: unknown
  data?: unknown
  error?: { code?: unknown; message?: unknown }
}

const bodyPreview = (text: string): string =>
  text.trim() === '' ? 'empty body' : text.slice(0, 200)

const parseBody = (text: string): ExtendedEnvelope | undefined => {
  try {
    const data = parseVenueJson(text)
    return typeof data === 'object' && data !== null
      ? (data as ExtendedEnvelope)
      : undefined
  } catch {
    return undefined
  }
}

/**
 * HTTP boundary against Extended's REST API. Requests go from the client
 * straight to Extended: the API key never reaches the LI.FI backend. The
 * client unwraps `data` from an `OK` envelope and throws
 * {@link ExtendedApiError} for every answer that is not a success. Only GET
 * requests are retried, because Extended writes are not idempotent.
 *
 * @public
 */
export class ExtendedApiClient {
  private readonly baseUrl: string
  private readonly signal: AbortSignal | undefined
  private readonly policy: ResolvedRetryPolicy
  private readonly fetchImpl: typeof fetch | undefined

  constructor(baseUrl: string, options?: ExtendedApiClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.signal = options?.signal
    this.policy = options?.policy ?? EXTENDED_RETRY_DEFAULTS
    this.fetchImpl = options?.fetchImpl
  }

  async send<T>(
    method: ExtendedHttpMethod,
    path: string,
    options?: ExtendedRequestOptions
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': EXTENDED_USER_AGENT,
      ...options?.headers,
    }
    if (options?.apiKey !== undefined) {
      headers['X-Api-Key'] = options.apiKey
    }
    const init: RequestInit = { method, headers }
    if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(options.body)
    }
    const response = await fetchWithRetry(`${this.baseUrl}${path}`, init, {
      policy: method === 'GET' ? this.policy : DISABLED_RETRY,
      fetchImpl: this.fetchImpl,
      signal: this.signal,
    })
    const text = await response.text()
    return unwrap<T>(path, response.status, parseBody(text), text)
  }
}

function unwrap<T>(
  path: string,
  httpStatus: number,
  envelope: ExtendedEnvelope | undefined,
  text: string
): T {
  if (httpStatus >= 200 && httpStatus < 300 && envelope?.status === 'OK') {
    return envelope.data as T
  }
  const venueCode =
    typeof envelope?.error?.code === 'number' ? envelope.error.code : undefined
  const venueMessage =
    typeof envelope?.error?.message === 'string'
      ? envelope.error.message
      : bodyPreview(text)
  throw new ExtendedApiError(
    `Extended ${path} failed (${venueCode ?? httpStatus}): ${venueMessage}`,
    httpStatus,
    venueCode,
    httpStatus < 300 || httpStatus >= 500
      ? PerpsErrorCode.ThirdPartyError
      : errorCodeFromStatus(httpStatus, PerpsErrorCode.ExchangeRejected, {
          401: PerpsErrorCode.Unauthorized,
        })
  )
}
