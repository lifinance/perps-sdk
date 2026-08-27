import type { ReferralActivityResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import { buildUrl, request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getReferralActivity}.
 *
 * @public
 */
export interface GetReferralActivityParams {
  address: Address
  /** Maximum items returned; backend defaults and caps apply. */
  limit?: number
  /** Opaque pagination cursor from the previous response. */
  cursor?: string
}

/**
 * Get the addresses attached to `address`'s owned internal referral code, with
 * the executed notional recorded against each attachment. Provider-independent
 * — reads from the platform `meta` surface, not a venue plugin.
 *
 * An address that owns no code resolves to `items: []` with `hasMore: false`
 * and no cursor.
 *
 * @throws {PerpsError} On backend error responses, network, or parsing errors.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ apiKey: 'your-api-key' })
 * const { items, pagination } = await getReferralActivity(client, {
 *   address: '0x1234...',
 *   limit: 50,
 * })
 * ```
 * @public
 */
export async function getReferralActivity(
  client: PerpsSDKClient,
  params: GetReferralActivityParams,
  options?: SDKRequestOptions
): Promise<ReferralActivityResponse> {
  const url = buildUrl(`${client.config.apiUrl}/meta/referral/activity`, {
    address: params.address,
    limit: params.limit,
    cursor: params.cursor,
  })
  return request<ReferralActivityResponse>(client.config, url, {}, options)
}
