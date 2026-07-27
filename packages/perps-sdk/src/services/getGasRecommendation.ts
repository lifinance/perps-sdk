import type { GasRecommendationResponse } from '@lifi/types'
import { request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * LI.FI API base URL for reads the user's client makes directly, without the
 * perps backend in the path.
 *
 * @public
 */
export const LIFI_API_URL = 'https://li.quest/v1'

/**
 * Parameters for {@link getGasRecommendation}.
 *
 * @public
 */
export interface GetGasRecommendationParams {
  /** Chain to hold native gas on — a `firstDepositPipeline` flow's `chainId`. */
  chainId: number
}

/**
 * How much native gas LI.FI suggests holding on `params.chainId` to transact
 * there, for seeding the gas leg of a first-deposit pipeline. Read straight
 * from the LI.FI API by the user's client.
 *
 * @returns The suggestion, with `available: false` and no amounts on a chain
 *   LI.FI cannot source gas for.
 * @throws {PerpsError} On API error responses, or network/parsing errors.
 * @public
 */
export async function getGasRecommendation(
  client: PerpsSDKClient,
  params: GetGasRecommendationParams,
  options?: SDKRequestOptions
): Promise<GasRecommendationResponse> {
  return request<GasRecommendationResponse>(
    client.config,
    `${LIFI_API_URL}/gas/suggestion/${params.chainId}`,
    {},
    options
  )
}
