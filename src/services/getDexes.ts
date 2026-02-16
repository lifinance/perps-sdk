import type { DexesResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

/**
 * Get all available DEXes.
 *
 * @param client - The SDK client instance
 * @param options - Request options (e.g., AbortSignal)
 * @returns List of supported DEXes with their authorization requirements
 * @throws {HTTPError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { dexes } = await getDexes(client)
 * console.log(dexes) // [{ key: 'hyperliquid', name: 'Hyperliquid', ... }]
 * ```
 */
export async function getDexes(
  client: PerpsSDKClient,
  options?: SDKRequestOptions
): Promise<DexesResponse> {
  return request<DexesResponse>(
    client.config,
    `${client.config.apiUrl}/dexes`,
    {},
    options
  )
}
