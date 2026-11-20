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
  /** The response carries a secret, so errors leave its body out. */
  secretResponse?: boolean
}

interface ExtendedEnvelope {
  status?: unknown
  data?: unknown
  error?: { code?: unknown; message?: unknown }
  pagination?: { cursor?: unknown }
}

/** One page of a paginated Extended response. @internal */
export interface ExtendedPage<T> {
  data: T[]
  /** Id after which the next page starts; absent on the last page. */
  cursor: string | undefined
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
    const envelope = await this.request(method, path, options)
    return envelope.data as T
  }

  /** GET a paginated route; a page shorter than `limit` is the last one. */
  async getPage<T>(
    path: string,
    apiKey: string,
    params: Record<string, string | number | undefined>
  ): Promise<ExtendedPage<T>> {
    const query = Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&')
    const envelope = await this.request(
      'GET',
      query === '' ? path : `${path}?${query}`,
      { apiKey }
    )
    const data = Array.isArray(envelope.data) ? (envelope.data as T[]) : []
    const cursor = envelope.pagination?.cursor
    const limit = params.limit
    const isLastPage =
      cursor === undefined ||
      cursor === null ||
      (typeof limit === 'number' && data.length < limit)
    return { data, cursor: isLastPage ? undefined : String(cursor) }
  }

  private async request(
    method: ExtendedHttpMethod,
    path: string,
    options?: ExtendedRequestOptions
  ): Promise<ExtendedEnvelope> {
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
    return unwrap(
      path,
      response.status,
      parseBody(text),
      options?.secretResponse === true ? undefined : text
    )
  }
}

function unwrap(
  path: string,
  httpStatus: number,
  envelope: ExtendedEnvelope | undefined,
  previewText: string | undefined
): ExtendedEnvelope {
  if (httpStatus >= 200 && httpStatus < 300 && envelope?.status === 'OK') {
    return envelope
  }
  const venueCode =
    typeof envelope?.error?.code === 'number' ? envelope.error.code : undefined
  const venueMessage =
    typeof envelope?.error?.message === 'string'
      ? envelope.error.message
      : previewText === undefined
        ? 'body withheld'
        : bodyPreview(previewText)
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
