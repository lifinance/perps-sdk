import type { ReferralStatus } from '@lifi/perps-types'
import type { Address } from 'viem'
import { buildUrl, request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getReferralStatus}.
 *
 * @public
 */
export interface GetReferralStatusParams {
  address: Address
  /**
   * Candidate internal referral code to validate in the same read. The
   * response carries the backend's verdict on `candidate`, and reflects the
   * candidate in `onboarding.referralCode` when it is attachable.
   */
  code?: string
}

/**
 * Get an address's onboarding and internal-referral state: terms acceptance,
 * the code attached to it, the code it owns, whether it may create one, the
 * verdict on a candidate code, and the one onboarding step it must sign next.
 * Provider-independent — reads from the platform `meta` surface, not a venue
 * plugin.
 *
 * An address the backend holds no record for resolves to a well-formed
 * payload with `termsAccepted: false` and the optional state fields absent.
 *
 * @throws {PerpsError} On backend error responses, network, or parsing errors.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ apiKey: 'your-api-key' })
 * const status = await getReferralStatus(client, {
 *   address: '0x1234...',
 *   code: 'ABC123',
 * })
 * if (status.onboarding) {
 *   // one signature is outstanding; submit it via PerpsClient.submitOnboarding
 * }
 * ```
 * @public
 */
export async function getReferralStatus(
  client: PerpsSDKClient,
  params: GetReferralStatusParams,
  options?: SDKRequestOptions
): Promise<ReferralStatus> {
  const url = buildUrl(`${client.config.apiUrl}/meta/referral`, {
    address: params.address,
    code: params.code,
  })
  return request<ReferralStatus>(client.config, url, {}, options)
}
