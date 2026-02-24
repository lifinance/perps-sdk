import { PerpsErrorCode } from '@lifi/perps-types'
import { AgentManager } from '../agent/AgentManager.js'
import type { StorageAdapter } from '../agent/types.js'
import { PerpsErrorName } from '../errors/constants.js'
import { PerpsError } from '../errors/PerpsError.js'

export const DEFAULT_API_URL = 'https://develop.li.quest/v1/perps'

/**
 * Configuration options for creating a Perps SDK client.
 */
export interface PerpsConfig {
  /** Integrator identifier (required) */
  integrator: string
  /** Optional API key for authenticated requests */
  apiKey?: string
  /** Base API URL. Defaults to DEFAULT_API_URL */
  apiUrl?: string
  /** Disable version update check in development mode */
  disableVersionCheck?: boolean
  /** Custom storage adapter for agent keys. Defaults to localStorage. */
  storage?: StorageAdapter
  /** Optional request interceptor for custom handling */
  requestInterceptor?: RequestInterceptor
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

  const config: PerpsBaseConfig = {
    integrator: options.integrator,
    apiKey: options.apiKey,
    apiUrl,
    disableVersionCheck: options.disableVersionCheck,
    requestInterceptor: options.requestInterceptor,
  }

  const agentManager = new AgentManager(options.storage)

  return {
    get config() {
      return config
    },
    get agentManager() {
      return agentManager
    },
  }
}
