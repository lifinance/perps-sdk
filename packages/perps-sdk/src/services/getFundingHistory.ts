import type {
  FundingHistoryRange,
  FundingHistoryResponse,
} from '@lifi/perps-types'
import { buildUrl, request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getFundingHistory}.
 *
 * @public
 */
export interface GetFundingHistoryParams {
  provider: string
  /** Opaque provider `Market.id`, not a display symbol. */
  marketId: string
  /** Pick from the provider's `Provider.fundingHistoryRanges`. */
  range: FundingHistoryRange
}

/**
 * Get the settled funding history of a market, oldest bucket first. The rates
 * are raw hourly fractions, not an APR.
 *
 * @throws {PerpsError} On backend, network, or parsing errors.
 * @public
 */
export async function getFundingHistory(
  client: PerpsSDKClient,
  params: GetFundingHistoryParams,
  options?: SDKRequestOptions
): Promise<FundingHistoryResponse> {
  const url = buildUrl(`${client.config.apiUrl}/fundingHistory`, {
    provider: params.provider,
    marketId: params.marketId,
    range: params.range,
  })
  return request<FundingHistoryResponse>(
    client.config,
    url,
    { provider: params.provider },
    options
  )
}
