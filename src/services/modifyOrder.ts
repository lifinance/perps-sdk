import type {
  Address,
  ModifyOrderPayloadResponse,
  OrderSide,
} from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

export interface ModifyOrderInput {
  id: string
  price?: string
  size?: string
  triggerPrice?: string
  limitPrice?: string
}

export interface ModifyOrderParams {
  /** DEX to modify orders on (e.g., 'hyperliquid') */
  dex: string
  /** Wallet address */
  address: Address
  /** Address of the signer (for agent mode, this is the agent address) */
  signerAddress?: Address
  /** Market symbol */
  symbol: string
  /** Order side */
  side: OrderSide
  /** Modifications to apply */
  modifications: ModifyOrderInput[]
}

/**
 * Create modify order payloads for signing.
 * Returns typed data that must be signed by the user or agent.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Modify actions with typed data for signing
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { actions } = await modifyOrder(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   symbol: 'BTC',
 *   side: 'BUY',
 *   modifications: [
 *     { id: '12345', price: '62000', size: '0.2' }
 *   ]
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
 * // Submit the signed modification
 * await submitOrder(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   actions: signedActions
 * })
 * ```
 */
export async function modifyOrder(
  client: PerpsSDKClient,
  params: ModifyOrderParams,
  options?: SDKRequestOptions
): Promise<ModifyOrderPayloadResponse> {
  return request<ModifyOrderPayloadResponse>(
    client.config,
    `${client.config.apiUrl}/modifyOrder`,
    {
      method: 'POST',
      body: JSON.stringify({
        dex: params.dex,
        address: params.address,
        signerAddress: params.signerAddress,
        symbol: params.symbol,
        side: params.side,
        modifications: params.modifications,
      }),
    },
    options
  )
}
