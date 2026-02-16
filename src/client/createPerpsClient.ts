import { PerpsErrorCode } from '@lifi/perps-types'
import { AgentManager } from '../agent/AgentManager.js'
import type { StorageAdapter } from '../agent/types.js'
import { PerpsErrorName } from '../errors/constants.js'
import { PerpsError } from '../errors/PerpsError.js'
import { sleep } from '../utils/sleep.js'

const DEFAULT_API_URL = 'https://li.quest/v1/perps'
const HEALTH_POLL_INTERVAL_MS = 500
const HEALTH_MAX_ATTEMPTS = 50

/**
 * Configuration options for creating a Perps SDK client.
 */
export interface PerpsConfig {
  /** Integrator identifier (required) */
  integrator: string
  /** Optional API key for authenticated requests */
  apiKey?: string
  /** Base API URL. Defaults to https://li.quest/v1/perps */
  apiUrl?: string
  /** Disable version update check in development mode */
  disableVersionCheck?: boolean
  /** Custom storage adapter for agent keys. Defaults to localStorage. */
  storage?: StorageAdapter
  /** Optional request interceptor for custom handling */
  requestInterceptor?: RequestInterceptor
  /** Whether to perform a health check on startup before allowing requests. Default: true */
  healthCheck?: boolean
}

/**
 * Resolved configuration with required fields.
 */
export interface PerpsBaseConfig {
  /** Integrator identifier (required) */
  integrator: string
  /** Optional API key for authenticated requests */
  apiKey?: string
  /** Resolved API URL (always set) */
  apiUrl: string
  /** Disable version update check in development mode */
  disableVersionCheck?: boolean
  /** Optional request interceptor for custom handling */
  requestInterceptor?: RequestInterceptor
  /** Promise that resolves when the API is ready. Requests wait for this. */
  readyPromise?: Promise<void>
}

/**
 * Request interceptor function type.
 * Called before each request is made, allowing modification of fetch options.
 */
export type RequestInterceptor = (
  url: string,
  options: RequestInit
) => RequestInit | Promise<RequestInit>

/**
 * Options passed to service functions for request control.
 */
export interface SDKRequestOptions {
  /** AbortSignal to cancel the request */
  signal?: AbortSignal
}

/**
 * The Perps SDK client instance.
 * Holds configuration and agent manager for making API requests.
 */
export interface PerpsSDKClient {
  /** SDK configuration */
  readonly config: PerpsBaseConfig
  /** Agent manager for USER_AGENT signing mode */
  readonly agentManager: AgentManager
  /** Promise that resolves when the API health check passes. */
  readonly ready: Promise<void>
}

/**
 * Create a new Perps SDK client.
 *
 * @param options - Configuration options
 * @returns A new SDK client instance
 * @throws {PerpsError} If integrator is not provided
 *
 * @example
 * ```ts
 * const client = createPerpsClient({
 *   integrator: 'my-app',
 *   apiKey: 'optional-api-key',
 * })
 *
 * // Use with service functions
 * const { dexes } = await getDexes(client)
 * ```
 */
export function createPerpsClient(options: PerpsConfig): PerpsSDKClient {
  if (!options.integrator) {
    const error = new PerpsError(
      PerpsErrorCode.ValidationError,
      'Integrator is required. Please see documentation at https://docs.li.fi'
    )
    error.name = PerpsErrorName.ValidationError
    throw error
  }

  const apiUrl = options.apiUrl ?? DEFAULT_API_URL

  const readyPromise =
    options.healthCheck !== false ? pollHealth(apiUrl) : Promise.resolve()

  const config: PerpsBaseConfig = {
    integrator: options.integrator,
    apiKey: options.apiKey,
    apiUrl,
    disableVersionCheck: options.disableVersionCheck,
    requestInterceptor: options.requestInterceptor,
    readyPromise,
  }

  const agentManager = new AgentManager(options.storage)

  return {
    get config() {
      return config
    },
    get agentManager() {
      return agentManager
    },
    get ready() {
      return readyPromise
    },
  }
}

/**
 * Poll the API health endpoint until it returns a successful response.
 *
 * Derives the health URL from the apiUrl origin (e.g. https://li.quest/health/live).
 * Retries up to {@link HEALTH_MAX_ATTEMPTS} times with {@link HEALTH_POLL_INTERVAL_MS} delays.
 *
 * @throws {PerpsError} If the health endpoint does not respond after all attempts
 */
async function pollHealth(apiUrl: string): Promise<void> {
  const healthUrl = `${new URL(apiUrl).origin}/health/live`

  for (let i = 0; i < HEALTH_MAX_ATTEMPTS; i++) {
    try {
      const response = await fetch(healthUrl)
      if (response.ok) {
        return
      }
    } catch {
      // Server not reachable yet, retry
    }
    await sleep(HEALTH_POLL_INTERVAL_MS)
  }

  throw new PerpsError(
    PerpsErrorCode.ServerError,
    'API health check failed: server did not become ready'
  )
}
