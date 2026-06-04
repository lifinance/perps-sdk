import type { AssetsResponse } from '@lifi/perps-types'
import { buildUrl, request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getAssets}.
 *
 * @public
 */
export interface GetAssetsParams {
  provider: string
}

/**
 * Get the token/asset registry for a provider. Thin pass-through to the
 * LI.FI backend's Valkey-cached `/perps/assets` route, which centralises the
 * `asset id → symbol → logoURI` join so the SDK never calls a provider's
 * REST API directly for static registry data.
 *
 * @throws {PerpsError} On backend, network, or parsing errors.
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { assets } = await getAssets(client, { provider: 'lighter' })
 * ```
 * @public
 */
export async function getAssets(
  client: PerpsSDKClient,
  params: GetAssetsParams,
  options?: SDKRequestOptions
): Promise<AssetsResponse> {
  const url = buildUrl(`${client.config.apiUrl}/assets`, {
    provider: params.provider,
  })
  return request<AssetsResponse>(client.config, url, {}, options)
}
