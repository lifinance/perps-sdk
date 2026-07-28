import type { PricesResponse } from '@lifi/perps-types'
import { buildUrl, request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getMarketsContext}.
 *
 * @public
 */
export interface GetMarketsContextParams {
  provider: string
  /** Optional filter of opaque `Market.id`s (not display symbols). */
  marketIds?: string[]
}

/**
 * Get current market context (mid/mark/oracle) for markets, optionally filtered
 * by `Market.id`.
 *
 * @throws {PerpsError} On backend error responses, network, or parsing errors.
 * @public
 */
export async function getMarketsContext(
  client: PerpsSDKClient,
  params: GetMarketsContextParams,
  options?: SDKRequestOptions
): Promise<PricesResponse> {
  const url = buildUrl(`${client.config.apiUrl}/marketsContext`, {
    provider: params.provider,
    marketIds: params.marketIds?.join(','),
  })
  return request<PricesResponse>(client.config, url, {}, options)
}
