import { PerpsErrorCode } from '@lifi/perps-types'
import type {
  PerpsBaseConfig,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { HTTPError } from '../errors/HTTPError.js'
import { PerpsError } from '../errors/PerpsError.js'
import { version } from '../version.js'
import { sleep } from './sleep.js'

export interface RequestOptions extends RequestInit {
  /** Number of retries on 5xx errors. Default: 1 */
  retries?: number
}

const DEFAULT_RETRIES = 1

/**
 * Make an HTTP request to the Perps API.
 *
 * @param config - SDK configuration
 * @param url - The full URL to request
 * @param options - Fetch options plus retries
 * @param sdkOptions - SDK-specific options (signal, etc.)
 * @returns Parsed JSON response
 * @throws {HTTPError} On non-2xx responses
 * @throws {PerpsError} On network or parsing errors
 */
export async function request<T>(
  config: PerpsBaseConfig,
  url: string,
  options: RequestOptions = {},
  sdkOptions?: SDKRequestOptions
): Promise<T> {
  // Wait for API health check to pass before making requests
  if (config.readyPromise) {
    await config.readyPromise
  }

  const retries = options.retries ?? DEFAULT_RETRIES

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-lifi-integrator': config.integrator,
    'x-lifi-perps-sdk': version,
    ...(options.headers as Record<string, string>),
  }

  if (config.apiKey) {
    headers['x-lifi-api-key'] = config.apiKey
  }

  // Merge signal from sdkOptions into options
  let finalOptions: RequestInit = {
    ...options,
    headers,
    signal: sdkOptions?.signal ?? options.signal,
  }

  // Apply request interceptor if configured
  if (config.requestInterceptor) {
    finalOptions = await config.requestInterceptor(url, finalOptions)
  }

  try {
    const response = await fetch(url, finalOptions)

    if (!response.ok) {
      const error = new HTTPError(response, url)
      await error.buildAdditionalDetails()

      // Retry on 5xx errors
      if (retries > 0 && response.status >= 500) {
        await sleep(500)
        return request<T>(
          config,
          url,
          { ...options, retries: retries - 1 },
          sdkOptions
        )
      }

      throw error
    }

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof HTTPError || error instanceof PerpsError) {
      throw error
    }

    // Network error or other fetch failure
    throw new PerpsError(
      PerpsErrorCode.ServerError,
      error instanceof Error ? error.message : 'Request failed'
    )
  }
}

/**
 * Build a URL with query parameters.
 *
 * @param baseUrl - The base URL
 * @param params - Query parameters (undefined values are filtered out)
 * @returns Full URL with query string
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
