import type {
  Address,
  SignedWithdrawal,
  SubmitWithdrawalResponse,
} from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

export interface SubmitWithdrawalParams {
  /** DEX to withdraw from (e.g., 'hyperliquid') */
  dex: string
  /** Wallet address (account owner) */
  address: Address
  /** Signed withdrawal action */
  action: SignedWithdrawal
}

/**
 * Submit a signed withdrawal to the DEX.
 *
 * Withdrawals are user-signed only — agents cannot initiate withdrawals.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Withdrawal result
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { result } = await submitWithdrawal(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   action: signedAction,
 * })
 *
 * if (result.success) {
 *   console.log('Withdrawal submitted')
 * } else {
 *   console.error(`Withdrawal failed: ${result.error}`)
 * }
 * ```
 */
export async function submitWithdrawal(
  client: PerpsSDKClient,
  params: SubmitWithdrawalParams,
  options?: SDKRequestOptions
): Promise<SubmitWithdrawalResponse> {
  return request<SubmitWithdrawalResponse>(
    client.config,
    `${client.config.apiUrl}/withdrawal`,
    {
      method: 'POST',
      body: JSON.stringify({
        dex: params.dex,
        address: params.address,
        action: params.action,
      }),
    },
    options
  )
}
