import type { TermsAcceptanceStatus } from '@lifi/perps-types'
import type { Address } from 'viem'
import { buildUrl, request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Get the current Terms of Service (version + full content) and whether the
 * given address has accepted them. Provider-independent — reads from the
 * platform `meta` surface, not a venue plugin.
 *
 * @param client - The SDK client instance
 * @param address - Address whose acceptance status to resolve
 * @param options - Request options (e.g., AbortSignal)
 * @throws {PerpsError} On backend error responses, network, or parsing errors.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const terms = await getTermsAcceptance(client, '0x1234...')
 * if (!terms.accepted) {
 *   // prompt the user to accept terms.content (version terms.termsVersion)
 * }
 * ```
 * @public
 */
export async function getTermsAcceptance(
  client: PerpsSDKClient,
  address: Address,
  options?: SDKRequestOptions
): Promise<TermsAcceptanceStatus> {
  const url = buildUrl(`${client.config.apiUrl}/meta/terms`, { address })
  return request<TermsAcceptanceStatus>(client.config, url, {}, options)
}
