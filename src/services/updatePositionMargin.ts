import type { Address, UpdatePositionMarginResponse } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

export interface UpdatePositionMarginParams {
  /** DEX to update position margin on (e.g., 'hyperliquid') */
  dex: string
  /** Wallet address */
  address: Address
  /** Address of the signer (for agent mode, this is the agent address) */
  signerAddress?: Address
  /** Market symbol (e.g., 'ETH') */
  symbol: string
  /** Whether to add or remove margin */
  action: 'add' | 'remove'
  /** Amount of margin to add/remove (in USD) */
  amount: string
}

/**
 * Build position margin update payloads for signing.
 * Returns typed data that must be signed by the user or agent.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Position actions with typed data for signing
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { actions } = await updatePositionMargin(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   symbol: 'ETH',
 *   action: 'add',
 *   amount: '100'
 * })
 *
 * // Sign each action with the user's wallet or agent key
 * const signedActions = await Promise.all(
 *   actions.map(async (a) => ({
 *     action: a.action,
 *     typedData: a.typedData,
 *     signature: await walletClient.signTypedData(a.typedData)
 *   }))
 * )
 * ```
 */
export async function updatePositionMargin(
  client: PerpsSDKClient,
  params: UpdatePositionMarginParams,
  options?: SDKRequestOptions
): Promise<UpdatePositionMarginResponse> {
  return request<UpdatePositionMarginResponse>(
    client.config,
    `${client.config.apiUrl}/updatePositionMargin`,
    {
      method: 'POST',
      body: JSON.stringify({
        dex: params.dex,
        address: params.address,
        signerAddress: params.signerAddress,
        symbol: params.symbol,
        action: params.action,
        amount: params.amount,
      }),
    },
    options
  )
}
