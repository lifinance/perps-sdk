import type { SDKRequestOptions } from '@lifi/perps-sdk'
import { type Address, zeroAddress } from 'viem'
import type { HyperliquidContext } from '../context.js'
import type { HlPreTransferCheck } from '../types/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

/**
 * Parameters for {@link getAccountExists}.
 *
 * @public
 */
export interface GetAccountExistsParams {
  address: Address
}

/**
 * Resolve whether a Hyperliquid Core account exists for `address` via a
 * `preTransferCheck` info query. An account exists only after its first
 * deposit (which pays the one-time creation fee), so this is the deposit-first
 * gate for setup. `userExists` is independent of the `source` field, so a zero
 * address is used.
 * @throws {PerpsError} On Hyperliquid REST error, network, or parsing failures.
 * @public
 */
export const getAccountExists = async (
  { client, apiUrl }: HyperliquidContext,
  params: GetAccountExistsParams,
  options?: SDKRequestOptions
): Promise<boolean> => {
  const { userExists } = await infoRequest<HlPreTransferCheck>(
    apiUrl,
    {
      type: 'preTransferCheck',
      user: params.address,
      source: zeroAddress,
    },
    hlInfoOptions(client, options)
  )
  return userExists
}
