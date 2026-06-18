import type { Meta } from '@lifi/perps-types'
import { request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Get platform metadata: the API version and any active platform-level notices.
 *
 * @returns Platform version and the list of active notices
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { version, notices } = await getMeta(client)
 * ```
 * @public
 */
export async function getMeta(
  client: PerpsSDKClient,
  options?: SDKRequestOptions
): Promise<Meta> {
  return request<Meta>(
    client.config,
    `${client.config.apiUrl}/meta`,
    {},
    options
  )
}
