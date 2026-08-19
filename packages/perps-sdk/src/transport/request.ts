import type { PerpsErrorBody } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'
import type { PerpsBaseConfig, SDKRequestOptions } from '../types/config.js'
import { version } from '../version.js'
import { fetchWithRetry, isAbortError } from './fetchWithRetry.js'
import {
  LIFI_REQUEST_KEY,
  LIFI_RETRY_DEFAULTS,
  type RetryPolicy,
  resolveRetryPolicy,
} from './retryPolicy.js'

/**
 * `RequestInit` plus a per-call retry override.
 *
 * @internal
 */
export interface RequestOptions extends RequestInit {
  /** Per-call retry override. Falls back to the resolved client-level policy. */
  retry?: RetryPolicy | false
}

/**
 * Internal HTTP helper: applies SDK headers, retry policy, and the request
 * interceptor, then normalizes failures into {@link PerpsError}.
 *
 * @internal
 */
export async function request<T>(
  config: PerpsBaseConfig,
  url: string,
  options: RequestOptions = {},
  sdkOptions?: SDKRequestOptions
): Promise<T> {
  const { retry, ...fetchInit } = options
  const policy =
    retry !== undefined
      ? resolveRetryPolicy(LIFI_RETRY_DEFAULTS, retry, LIFI_REQUEST_KEY)
      : resolveRetryPolicy(LIFI_RETRY_DEFAULTS, config.retry, LIFI_REQUEST_KEY)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-lifi-perps-sdk': version,
    ...(fetchInit.headers as Record<string, string>),
  }

  if (config.apiKey) {
    headers['x-lifi-api-key'] = config.apiKey
    if (config.integrator) {
      headers['x-lifi-integrator'] = config.integrator
    }
  }

  let finalOptions: RequestInit = {
    ...fetchInit,
    headers,
    signal: sdkOptions?.signal ?? fetchInit.signal,
  }

  if (config.requestInterceptor) {
    finalOptions = await config.requestInterceptor(url, finalOptions)
  }

  try {
    const response = await fetchWithRetry(url, finalOptions, {
      policy,
      fetchImpl: config.fetch,
      signal: sdkOptions?.signal ?? finalOptions.signal ?? undefined,
    })

    if (!response.ok) {
      let body: PerpsErrorBody | undefined
      try {
        body = await response.json()
      } catch {}

      const fallbackMessage = `Request failed with status code ${response.status}`
      if (
        body &&
        typeof body.code === 'number' &&
        typeof body.message === 'string'
      ) {
        const error = new PerpsError(body.code, body.message)
        error.tool = body.tool ?? 'unknown'
        throw error
      }
      const error = new PerpsError(PerpsErrorCode.DefaultError, fallbackMessage)
      error.tool = 'unknown'
      throw error
    }

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof PerpsError) {
      throw error
    }

    if (isAbortError(error)) {
      throw error
    }

    throw new PerpsError(
      PerpsErrorCode.ServerError,
      error instanceof Error ? error.message : 'Request failed'
    )
  }
}

/**
 * Build a URL with a query string from defined params (skips `undefined`).
 *
 * @internal
 */
export function buildUrl(
  baseUrl: string,
  params: Record<string, string | number | boolean | undefined>
): string {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value))
    }
  }

  const queryString = searchParams.toString()
  return queryString ? `${baseUrl}?${queryString}` : baseUrl
}
