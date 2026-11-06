import type { Meta } from '@lifi/perps-types'
import { request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Get platform metadata: the API version and the notices the backend serves.
 * A notice without `providerKeys` is global; a notice with `providerKeys` is
 * scoped to those providers. The SDK returns notices as served and does not
 * filter them by `validFrom` / `validTo`.
 *
 * @returns Platform version and the global and provider-scoped notices
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ apiKey: 'your-api-key' })
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
