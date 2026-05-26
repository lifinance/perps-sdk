import {
  fetchWithRetry,
  PerpsError,
  type ResolvedRetryPolicy,
} from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'

export type ApiParams = Record<string, string | number | boolean>

export const LIGHTER_RETRY_DEFAULTS: ResolvedRetryPolicy = {
  enabled: true,
  maxAttempts: 2,
  baseDelayMs: 10_000,
  maxDelayMs: 60_000,
  respectRetryAfter: true,
  classify: ({ response }) => {
    if (response.status === 429 || response.status === 405) {
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

export interface LighterApiClientOptions {
  signal?: AbortSignal
  policy?: ResolvedRetryPolicy
  fetchImpl?: typeof fetch
}

/**
 * HTTP boundary against Lighter's REST API.
 *
 * Browser-direct by design: no LI.FI backend hop, no caching shim — caller
 * supplies the REST base URL, the path, and any query params, and we return
 * the parsed JSON body. Lighter advertises CORS headers on every public
 * endpoint (verified in ORD-330) so a vanilla `fetch` from the widget works.
 *
 * Auth-gated endpoints (accountLimits, accountActiveOrders, deposit/history,
 * withdraw/history, positionFunding, liquidations, transfer/history) take the
 * Lighter read-only token as the `auth` query parameter — NOT as an
 * `Authorization` header. This matches Lighter's OpenAPI spec and lets the
 * same call work browser-direct and from server-side proxies.
 *
 * Lighter signals rate limiting via 429 OR 405 (documented behaviour) with a
 * documented 60s firewall cooldown. The default {@link ResolvedRetryPolicy}
 * waits long enough to avoid hammering through the cooldown.
 */
export class LighterApiClient {
  private readonly baseUrl: string
  private readonly signal: AbortSignal | undefined
  private readonly policy: ResolvedRetryPolicy
  private readonly fetchImpl: typeof fetch | undefined

  constructor(baseUrl: string, options?: LighterApiClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.signal = options?.signal
    this.policy = options?.policy ?? LIGHTER_RETRY_DEFAULTS
    this.fetchImpl = options?.fetchImpl
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
    return this.doGet<T>(path, params)
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
    return this.doGet<T>(path, { ...params, auth: authToken })
  }

  /**
   * GET that surfaces the raw `{status, body}` pair without throwing on
   * non-2xx — used for endpoints (account lookup by L1 address) where the
   * caller distinguishes specific Lighter error codes from generic failures.
   */
  async getRaw<T>(
    path: string,
    params?: ApiParams
  ): Promise<{ status: number; data: T }> {
    const url = this.buildUrl(path, params)
    const response = await fetchWithRetry(
      url,
      {},
      { policy: this.policy, fetchImpl: this.fetchImpl, signal: this.signal }
    )
    const data = (await response.json().catch(() => undefined)) as T
    return { status: response.status, data }
  }

  private async doGet<T>(path: string, params?: ApiParams): Promise<T> {
    const url = this.buildUrl(path, params)
    const response = await fetchWithRetry(
      url,
      {},
      { policy: this.policy, fetchImpl: this.fetchImpl, signal: this.signal }
    )
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new PerpsError(
        PerpsErrorCode.ThirdPartyError,
        `Lighter API request failed: ${response.status} ${response.statusText} — ${body.slice(0, 200)}`
      )
    }
    return (await response.json()) as T
  }
}
