import type {
  Address,
  AuthorizationsResponse,
  SignedAuthorization,
} from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

export interface SubmitAuthorizationParams {
  /** DEX to authorize (e.g., 'hyperliquid') */
  dex: string
  /** Wallet address */
  address: Address
  /** Address of the signer (for agent mode, this is the agent address) */
  signerAddress?: Address
  /** Signed authorization actions */
  actions: SignedAuthorization[]
}

/**
 * Submit signed authorizations to the DEX.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Results for each authorization action
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { results } = await submitAuthorization(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   actions: signedActions
 * })
 *
 * for (const result of results) {
 *   if (result.success) {
 *     console.log(`${result.action} authorized`)
 *   } else {
 *     console.error(`${result.action} failed: ${result.error}`)
 *   }
 * }
 * ```
 */
export async function submitAuthorization(
  client: PerpsSDKClient,
  params: SubmitAuthorizationParams,
  options?: SDKRequestOptions
): Promise<AuthorizationsResponse> {
  return request<AuthorizationsResponse>(
    client.config,
    `${client.config.apiUrl}/authorization`,
    {
      method: 'POST',
      body: JSON.stringify({
        dex: params.dex,
        address: params.address,
        signerAddress: params.signerAddress,
        actions: params.actions,
      }),
    },
    options
  )
}
