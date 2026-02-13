import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import type {
  Address,
  SignedOrderAction,
  SubmitOrderResponse,
} from '../types/perps.js'
import { request } from '../utils/request.js'

export interface SubmitOrderParams {
  /** DEX to submit order to (e.g., 'hyperliquid') */
  dex: string
  /** Wallet address */
  address: Address
  /** Address of the signer (for agent mode, this is the agent address) */
  signerAddress?: Address
  /** Signed order actions */
  actions: SignedOrderAction[]
}

/**
 * Submit signed order actions to the DEX.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Results for each order action
 * @throws {HTTPError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 *
 * // After creating and signing order actions
 * const { results } = await submitOrder(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   actions: signedActions
 * })
 *
 * for (const result of results) {
 *   if (result.success) {
 *     console.log(`Order placed: ${result.orderId}`)
 *   } else {
 *     console.error(`Order failed: ${result.error}`)
 *   }
 * }
 * ```
 */
export async function submitOrder(
  client: PerpsSDKClient,
  params: SubmitOrderParams,
  options?: SDKRequestOptions
): Promise<SubmitOrderResponse> {
  return request<SubmitOrderResponse>(
    client.config,
    `${client.config.apiUrl}/order`,
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
