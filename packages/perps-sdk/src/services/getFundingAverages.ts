import type { FundingAveragesResponse } from '@lifi/perps-types'
import { buildUrl, request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getFundingAverages}.
 *
 * @public
 */
export interface GetFundingAveragesParams {
  provider: string
  /** Optional filter of opaque `Market.id`s (not display symbols). */
  marketIds?: string[]
}

/**
 * Get the settled funding averages (8h, 24h, 3d, 7d) for markets, optionally
 * filtered by `Market.id`. The rates are raw hourly fractions, not an APR.
 *
 * @throws {PerpsError} On backend error responses, network, or parsing errors.
 * @public
 */
export async function getFundingAverages(
  client: PerpsSDKClient,
  params: GetFundingAveragesParams,
  options?: SDKRequestOptions
): Promise<FundingAveragesResponse> {
  const url = buildUrl(`${client.config.apiUrl}/fundingAverages`, {
    provider: params.provider,
    marketIds: params.marketIds?.join(','),
  })
  return request<FundingAveragesResponse>(
    client.config,
    url,
    { provider: params.provider },
    options
  )
}
