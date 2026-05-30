import type { TokensResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetTokensParams {
  /** Provider to get tokens from (e.g., 'lighter') */
  provider: string
}

/**
 * Get the token registry for a provider. Thin pass-through to the LI.FI
 * backend's Valkey-cached `/perps/tokens` route, which centralises the
 * `asset_id → symbol → logoURI` join so the SDK never calls a provider's
 * REST API directly for static registry data.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { tokens } = await getTokens(client, { provider: 'lighter' })
 * ```
 */
export async function getTokens(
  client: PerpsSDKClient,
  params: GetTokensParams,
  options?: SDKRequestOptions
): Promise<TokensResponse> {
  const url = buildUrl(`${client.config.apiUrl}/tokens`, {
    provider: params.provider,
  })
  return request<TokensResponse>(client.config, url, {}, options)
}
