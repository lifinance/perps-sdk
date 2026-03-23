import type {
  Address,
  SignedPositionAction,
  SubmitPositionResponse,
} from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

export interface SubmitPositionParams {
  /** DEX to submit position action to (e.g., 'hyperliquid') */
  dex: string
  /** Wallet address */
  address: Address
  /** Address of the signer (for agent mode, this is the agent address) */
  signerAddress?: Address
  /** Signed position actions */
  actions: SignedPositionAction[]
}

/**
 * Submit signed position actions to the DEX.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Results for each position action
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 *
 * // After creating and signing position actions
 * const { results } = await submitPosition(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   actions: signedActions
 * })
 *
 * for (const result of results) {
 *   if (result.success) {
 *     console.log(`Position action succeeded: ${result.action}`)
 *   } else {
 *     console.error(`Position action failed: ${result.error}`)
 *   }
 * }
 * ```
 */
export async function submitPosition(
  client: PerpsSDKClient,
  params: SubmitPositionParams,
  options?: SDKRequestOptions
): Promise<SubmitPositionResponse> {
  return request<SubmitPositionResponse>(
    client.config,
    `${client.config.apiUrl}/position`,
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
