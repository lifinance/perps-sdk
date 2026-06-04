import type { ProvidersResponse } from '@lifi/perps-types'
import { request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Get all available providers.
 *
 * @param client - The SDK client instance
 * @param options - Request options (e.g., AbortSignal)
 * @returns List of supported providers with their authorization requirements
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { providers } = await getProviders(client)
 * console.log(providers) // [{ key: 'hyperliquid', name: 'Hyperliquid', ... }]
 * ```
 * @public
 */
export async function getProviders(
  client: PerpsSDKClient,
  options?: SDKRequestOptions
): Promise<ProvidersResponse> {
  return request<ProvidersResponse>(
    client.config,
    `${client.config.apiUrl}/providers`,
    {},
    options
  )
}
