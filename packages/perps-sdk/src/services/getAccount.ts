import type { AccountResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { requireProvider } from '../utils/requireProvider.js'

/**
 * Parameters for {@link getAccount}.
 *
 * @public
 */
export interface GetAccountParams {
  /** Provider to get account from (e.g., 'hyperliquid') */
  provider: string
  /** Wallet address */
  address: Address
}

/**
 * Get account information (balances, margin, fee tier, typed config).
 * Delegates to the registered venue plugin (direct-to-venue); requires the
 * provider plugin to be registered on the client.
 *
 * Use {@link getPositions} and {@link getOrders} to fetch positions and orders
 * separately.
 *
 * @throws {PerpsError} When the provider plugin is not registered, or on
 *   backend / network / parsing errors.
 * @example
 * ```ts
 * const account = await getAccount(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...',
 * })
 * console.log(account.balances)
 * ```
 * @public
 */
export async function getAccount(
  client: PerpsSDKClient,
  params: GetAccountParams,
  options?: SDKRequestOptions
): Promise<AccountResponse> {
  return requireProvider(client, params.provider).getAccount(
    { address: params.address },
    options
  )
}
