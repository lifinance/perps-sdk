import type {
  Address,
  CreateWithdrawalResponse,
  WithdrawalInput,
} from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

export interface CreateWithdrawalParams {
  /** DEX to withdraw from (e.g., 'hyperliquid') */
  dex: string
  /** Wallet address (account owner) */
  address: Address
  /** Withdrawal details (destination address and amount) */
  withdrawal: WithdrawalInput
}

/**
 * Create a withdrawal payload for signing.
 * Returns typed data that must be signed by the user's wallet.
 *
 * Withdrawals are user-signed only — agents cannot initiate withdrawals.
 * This is a protocol-level security feature.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Withdrawal action with typed data for signing
 * @throws {HTTPError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @remarks
 * The example below uses Hyperliquid. Withdrawal mechanics vary by DEX.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { action } = await createWithdrawal(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   withdrawal: {
 *     destination: '0x1234...',
 *     amount: '100.0',
 *   },
 * })
 *
 * // Sign the action's typedData with the user's wallet
 * const signedAction = {
 *   action: action.action,
 *   typedData: action.typedData,
 *   signature: await walletClient.signTypedData(action.typedData),
 * }
 * ```
 */
export async function createWithdrawal(
  client: PerpsSDKClient,
  params: CreateWithdrawalParams,
  options?: SDKRequestOptions
): Promise<CreateWithdrawalResponse> {
  return request<CreateWithdrawalResponse>(
    client.config,
    `${client.config.apiUrl}/createWithdrawal`,
    {
      method: 'POST',
      body: JSON.stringify({
        dex: params.dex,
        address: params.address,
        withdrawal: params.withdrawal,
      }),
    },
    options
  )
}
