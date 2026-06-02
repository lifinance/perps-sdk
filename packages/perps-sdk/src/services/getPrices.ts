import type { PricesResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

/**
 * Parameters for {@link getPrices}.
 *
 * @public
 */
export interface GetPricesParams {
  /** Provider to get prices from (e.g., 'hyperliquid') */
  provider: string
  /** Optional filter — opaque `Market.id`s (not display symbols). */
  marketIds?: string[]
}

/**
 * Get current prices for markets, optionally filtered by `Market.id`.
 *
 * @throws {PerpsError} On backend error responses, network, or parsing errors.
 * @public
 */
export async function getPrices(
  client: PerpsSDKClient,
  params: GetPricesParams,
  options?: SDKRequestOptions
): Promise<PricesResponse> {
  const url = buildUrl(`${client.config.apiUrl}/prices`, {
    provider: params.provider,
    marketIds: params.marketIds?.join(','),
  })
  return request<PricesResponse>(client.config, url, {}, options)
}
