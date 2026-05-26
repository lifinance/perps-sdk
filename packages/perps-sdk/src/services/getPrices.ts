import type { PricesResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetPricesParams {
  /** Provider to get prices from (e.g., 'hyperliquid') */
  provider: string
  /** Optional filter — canonical `Asset.assetId`s (not display symbols). */
  assetIds?: string[]
}

/**
 * Get current prices for markets, optionally filtered by `Asset.assetId`.
 */
export async function getPrices(
  client: PerpsSDKClient,
  params: GetPricesParams,
  options?: SDKRequestOptions
): Promise<PricesResponse> {
  const url = buildUrl(`${client.config.apiUrl}/prices`, {
    provider: params.provider,
    assetIds: params.assetIds?.join(','),
  })
  return request<PricesResponse>(client.config, url, {}, options)
}
