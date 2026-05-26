import {
  fetchWithRetry,
  PerpsError,
  type ResolvedRetryPolicy,
} from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'

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

export interface InfoRequestOptions {
  signal?: AbortSignal
  policy?: ResolvedRetryPolicy
  fetchImpl?: typeof fetch
}

/**
 * POST to the Hyperliquid `/info` endpoint and return the parsed JSON body.
 *
 * Direct-to-venue: no proxy, no AJV validation, no cache. The caller's type
 * parameter is trusted; consumers should treat the response shape as
 * upstream-controlled and normalise into `@lifi/perps-types` shapes before
 * surfacing.
 *
 * Non-2xx responses raise a {@link PerpsError} with the Hyperliquid provider key.
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
        body: JSON.stringify(body),
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
