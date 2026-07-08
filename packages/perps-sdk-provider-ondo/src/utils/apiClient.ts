import {
  DISABLED_RETRY,
  fetchWithRetry,
  PerpsError,
  type ResolvedRetryPolicy,
} from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { OndoGenericResponse } from '../types/auth.js'
import type { OndoPageInfo } from '../types/wire.js'

/** @internal */
export type ApiParams = Record<string, string | number | boolean>

/** One page of a paginated Ondo response: `pageInfo` is a SIBLING of `result`. @public */
export interface OndoPage<T> {
  result: T[]
  pageInfo: OndoPageInfo | undefined
}

/** @internal */
export type OndoHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/**
 * Ondo request failure — a non-2xx HTTP status, a `success: false` envelope,
 * or a body that is not a `GenericResponse` envelope at all. `errorCode`
 * carries the wire `error_code` when the envelope advertised one.
 *
 * @public
 */
export class OndoApiError extends PerpsError {
  readonly errorCode: string | undefined

  constructor(message: string, errorCode?: string) {
    super(PerpsErrorCode.ThirdPartyError, message)
    this.errorCode = errorCode
  }
}

/**
 * The Ondo session JWT was rejected (HTTP 401). Distinct from
 * {@link OndoApiError} so callers can evict the stored token and re-run the
 * SIWE login instead of surfacing a generic venue failure.
 *
 * @public
 */
export class OndoSessionExpiredError extends PerpsError {
  constructor(message: string) {
    super(PerpsErrorCode.Unauthorized, message)
  }
}

/** @internal */
export const ONDO_RETRY_DEFAULTS: ResolvedRetryPolicy = {
  enabled: true,
  maxAttempts: 2,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  respectRetryAfter: true,
  classify: ({ response }) => {
    if (response.status === 429) {
      return 'retry-rate-limit'
    }
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

/** @internal */
export interface OndoApiClientOptions {
  signal?: AbortSignal
  policy?: ResolvedRetryPolicy
  fetchImpl?: typeof fetch
}

/** @internal */
export interface OndoRequestOptions {
  params?: ApiParams
  /** Ondo session JWT, sent as `Authorization: Bearer <token>`. */
  authToken?: string
}

const isGenericResponse = (
  data: unknown
): data is OndoGenericResponse<unknown> =>
  typeof data === 'object' &&
  data !== null &&
  typeof (data as { success?: unknown }).success === 'boolean'

/**
 * HTTP boundary against Ondo's REST API.
 *
 * Browser-direct by design: the session JWT lives client-side only, so
 * credentialed calls (`authToken` option) go straight to Ondo — never through
 * the LI.FI backend. Every response is an `OndoGenericResponse` envelope; the
 * client unwraps `result` on success and throws {@link OndoApiError} (carrying
 * the wire `error_code`) otherwise. An HTTP 401 throws
 * {@link OndoSessionExpiredError} so callers can re-run the SIWE login.
 * @public
 */
export class OndoApiClient {
  private readonly baseUrl: string
  private readonly signal: AbortSignal | undefined
  private readonly policy: ResolvedRetryPolicy
  private readonly fetchImpl: typeof fetch | undefined

  constructor(baseUrl: string, options?: OndoApiClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.signal = options?.signal
    this.policy = options?.policy ?? ONDO_RETRY_DEFAULTS
    this.fetchImpl = options?.fetchImpl
  }

  async get<T>(path: string, options?: OndoRequestOptions): Promise<T> {
    const { status, data } = await this.perform(path, {
      method: 'GET',
      params: options?.params,
      authToken: options?.authToken,
      policy: this.policy,
    })
    return this.unwrap<T>(path, status, data)
  }

  /**
   * GET a paginated endpoint, preserving the `pageInfo` sibling that
   * {@link get}'s envelope unwrap would otherwise drop.
   */
  async getPage<T>(
    path: string,
    options?: OndoRequestOptions
  ): Promise<OndoPage<T>> {
    const { status, data } = await this.perform(path, {
      method: 'GET',
      params: options?.params,
      authToken: options?.authToken,
      policy: this.policy,
    })
    const result = this.unwrap<T[] | null>(path, status, data)
    const pageInfo = (data as { pageInfo?: OndoPageInfo }).pageInfo
    return { result: result ?? [], pageInfo }
  }

  /**
   * Arbitrary-method request with caller-prebuilt headers — the execution
   * surface for credential-bearing `RestCallSignedActionStep`s, whose
   * `Authorization` header is attached by `signActions` from the token store.
   * Only GET is ever retried; writes are not idempotent.
   */
  async send<T>(
    method: OndoHttpMethod,
    path: string,
    options?: { body?: unknown; headers?: Record<string, string> }
  ): Promise<T> {
    const { status, data } = await this.perform(path, {
      method,
      body: options?.body,
      headers: options?.headers,
      policy: method === 'GET' ? this.policy : DISABLED_RETRY,
    })
    return this.unwrap<T>(path, status, data)
  }

  /**
   * POSTs are never auto-retried regardless of policy: Ondo writes (order
   * placement, login completion) are not idempotent, and a retried request
   * whose first attempt landed would double-submit.
   */
  async post<T>(
    path: string,
    body?: unknown,
    options?: Pick<OndoRequestOptions, 'authToken'>
  ): Promise<T> {
    const { status, data } = await this.perform(path, {
      method: 'POST',
      body,
      authToken: options?.authToken,
      policy: DISABLED_RETRY,
    })
    return this.unwrap<T>(path, status, data)
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

  private async perform(
    path: string,
    options: {
      method: OndoHttpMethod
      params?: ApiParams
      body?: unknown
      authToken?: string
      headers?: Record<string, string>
      policy: ResolvedRetryPolicy
    }
  ): Promise<{ status: number; data: unknown }> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.headers,
    }
    if (options.authToken) {
      headers.Authorization = `Bearer ${options.authToken}`
    }
    const init: RequestInit = { method: options.method, headers }
    if (options.method !== 'GET' && options.method !== 'DELETE') {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(options.body ?? {})
    }
    const response = await fetchWithRetry(
      this.buildUrl(path, options.params),
      init,
      { policy: options.policy, fetchImpl: this.fetchImpl, signal: this.signal }
    )
    const data: unknown = await response.json().catch(() => undefined)
    return { status: response.status, data }
  }

  private unwrap<T>(path: string, status: number, data: unknown): T {
    if (status === 401) {
      throw new OndoSessionExpiredError(
        `Ondo rejected the session token for ${path}`
      )
    }
    if (status < 200 || status >= 300) {
      throw new OndoApiError(
        `Ondo API request failed: ${status} — ${JSON.stringify(data).slice(0, 200)}`,
        isGenericResponse(data) ? data.error_code : undefined
      )
    }
    if (!isGenericResponse(data)) {
      throw new OndoApiError(
        `Ondo API returned an unexpected body for ${path}: ${JSON.stringify(data).slice(0, 200)}`
      )
    }
    if (!data.success) {
      throw new OndoApiError(
        `Ondo API error for ${path}: ${data.error_code ?? 'unknown'} — ${data.error ?? 'no error message'}`,
        data.error_code
      )
    }
    return data.result as T
  }
}
