import type {
  Address,
  AuthorizationInput,
  CreateAuthorizationResponse,
} from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

export interface CreateAuthorizationParams {
  /** DEX to authorize (e.g., 'hyperliquid') */
  dex: string
  /** Wallet address */
  address: Address
  /** Address of the signer (for agent mode, this is the agent address) */
  signerAddress?: Address
  /** List of authorizations to create */
  authorizations: AuthorizationInput[]
}

/**
 * Create authorization payloads for signing.
 * Returns typed data that must be signed by the user or agent.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Authorization actions with typed data for signing
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @remarks
 * The example below uses Hyperliquid authorization keys. Use `getDexes()` to discover
 * available authorizations for each DEX.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { actions } = await createAuthorization(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   authorizations: [
 *     { key: 'ApproveAgent', params: { agentAddress: '0xabcd...' } },
 *     { key: 'ApproveBuilderFee' }
 *   ]
 * })
 *
 * // Sign each action's typedData with the user's wallet
 * const signedActions = await Promise.all(
 *   actions.map(async (a) => ({
 *     action: a.action,
 *     typedData: a.typedData,
 *     signature: await walletClient.signTypedData(a.typedData)
 *   }))
 * )
 * ```
 */
export async function createAuthorization(
  client: PerpsSDKClient,
  params: CreateAuthorizationParams,
  options?: SDKRequestOptions
): Promise<CreateAuthorizationResponse> {
  return request<CreateAuthorizationResponse>(
    client.config,
    `${client.config.apiUrl}/createAuthorization`,
    {
      method: 'POST',
      body: JSON.stringify({
        dex: params.dex,
        address: params.address,
        signerAddress: params.signerAddress,
        authorizations: params.authorizations,
      }),
    },
    options
  )
}
