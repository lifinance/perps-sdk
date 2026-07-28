import {
  fetchWithRetry,
  PerpsError,
  type PerpsSDKClient,
  type ResolvedRetryPolicy,
  resolveRetryPolicy,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { isAddress } from 'viem'
import { PROVIDER_KEY } from '../constants.js'

const normalizeInfoValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return isAddress(value, { strict: false }) ? value.toLowerCase() : value
  }
  if (Array.isArray(value)) {
    return value.map(normalizeInfoValue)
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        normalizeInfoValue(nestedValue),
      ])
    )
  }
  return value
}

/** @internal */
export const HYPERLIQUID_RETRY_DEFAULTS: ResolvedRetryPolicy = {
  enabled: true,
  maxAttempts: 3,
  baseDelayMs: 2_000,
  maxDelayMs: 15_000,
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

/**
 * Transport options for a direct Hyperliquid `/info` request. `policy`
 * controls retries, `signal` cancels the request, and `fetchImpl` overrides
 * the runtime's global `fetch` implementation.
 * @public
 */
export interface InfoRequestOptions {
  signal?: AbortSignal
  policy?: ResolvedRetryPolicy
  fetchImpl?: typeof fetch
}

/**
 * Resolve the client's retry/fetch config into options for {@link infoRequest}.
 *
 * @public
 */
export const hlInfoOptions = (
  client: PerpsSDKClient,
  options?: SDKRequestOptions
): InfoRequestOptions => ({
  signal: options?.signal,
  policy: resolveRetryPolicy(
    HYPERLIQUID_RETRY_DEFAULTS,
    client.config.retry,
    PROVIDER_KEY
  ),
  fetchImpl: client.config.fetch,
})

/**
 * POST to the Hyperliquid `/info` endpoint and return the parsed JSON body.
 *
 * Direct-to-venue: no proxy, no AJV validation, no cache. The caller's type
 * parameter is trusted; consumers should treat the response shape as
 * upstream-controlled and normalise into `@lifi/perps-types` shapes before
 * surfacing.
 *
 * Non-2xx responses raise a {@link PerpsError} with the Hyperliquid provider key.
 * @public
 */
export async function infoRequest<T>(
  apiUrl: string,
  body: Record<string, unknown>,
  options?: InfoRequestOptions
): Promise<T> {
  const policy = options?.policy ?? HYPERLIQUID_RETRY_DEFAULTS

  let response: Response
  try {
    response = await fetchWithRetry(
      `${apiUrl}/info`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizeInfoValue(body)),
      },
      {
        policy,
        fetchImpl: options?.fetchImpl,
        signal: options?.signal,
      }
    )
  } catch (error) {
    const err = new PerpsError(
      PerpsErrorCode.ServerError,
      error instanceof Error ? error.message : 'Hyperliquid info request failed'
    )
    err.tool = PROVIDER_KEY
    throw err
  }

  if (!response.ok) {
    const err = new PerpsError(
      PerpsErrorCode.ThirdPartyError,
      `Hyperliquid info request failed: ${response.status}`
    )
    err.tool = PROVIDER_KEY
    throw err
  }

  return (await response.json()) as T
}
