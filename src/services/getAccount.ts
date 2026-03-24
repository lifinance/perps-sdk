import type { AccountResponse, Address } from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { buildUrl, request } from '../utils/request.js'

export interface GetAccountParams {
  /** Provider to get account from (e.g., 'hyperliquid') */
  provider: string
  /** Wallet address */
  address: Address
}

/**
 * Get account information including balances, positions, and open orders.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Account details
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const account = await getAccount(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...'
 * })
 * console.log(account.balances) // [{ currency: 'USDC', amount: '10000.00' }]
 * console.log(account.positions) // [{ symbol: 'BTC', side: 'LONG', ... }]
 * console.log(account.openOrders) // [{ id: '123', symbol: 'BTC', ... }]
 * ```
 */
export async function getAccount(
  client: PerpsSDKClient,
  params: GetAccountParams,
  options?: SDKRequestOptions
): Promise<AccountResponse> {
  const url = buildUrl(`${client.config.apiUrl}/account`, {
    provider: params.provider,
    address: params.address,
  })
  return request<AccountResponse>(client.config, url, {}, options)
}
