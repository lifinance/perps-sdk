import type { Address, CancelOrderPayloadResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

export interface CancelOrderParams {
  /** DEX to cancel orders on (e.g., 'hyperliquid') */
  dex: string
  /** Wallet address */
  address: Address
  /** Address of the signer (for agent mode, this is the agent address) */
  signerAddress?: Address
  /** Order IDs to cancel */
  ids: string[]
}

/**
 * Create cancel order payloads for signing.
 * Returns typed data that must be signed by the user or agent.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Cancel actions with typed data for signing
 * @throws {HTTPError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { actions } = await cancelOrder(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   ids: ['order1', 'order2']
 * })
 *
 * // Sign with agent key or user wallet
 * const signedActions = await Promise.all(
 *   actions.map(async (a) => ({
 *     action: a.action,
 *     typedData: a.typedData,
 *     signature: await signTypedData(agentPrivateKey, a.typedData)
 *   }))
 * )
 *
 * // Submit the signed cancellation
 * await submitOrder(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   actions: signedActions
 * })
 * ```
 */
export async function cancelOrder(
  client: PerpsSDKClient,
  params: CancelOrderParams,
  options?: SDKRequestOptions
): Promise<CancelOrderPayloadResponse> {
  return request<CancelOrderPayloadResponse>(
    client.config,
    `${client.config.apiUrl}/cancelOrder`,
    {
      method: 'POST',
      body: JSON.stringify({
        dex: params.dex,
        address: params.address,
        signerAddress: params.signerAddress,
        ids: params.ids,
      }),
    },
    options
  )
}
