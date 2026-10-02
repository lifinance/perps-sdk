import { PerpsError, type SDKRequestOptions } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { type Address, zeroAddress } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import {
  hlInfoOptions,
  type InfoRequestOptions,
  infoRequest,
} from '../utils/infoClient.js'

/**
 * Parameters for {@link getAccountExists}.
 *
 * @public
 */
export interface GetAccountExistsParams {
  address: Address
}

async function readAccountExists(
  apiUrl: string,
  address: Address,
  options?: InfoRequestOptions
): Promise<boolean> {
  const response = await infoRequest<unknown>(
    apiUrl,
    {
      type: 'preTransferCheck',
      user: address,
      source: zeroAddress,
    },
    options
  )
  if (
    typeof response === 'object' &&
    response !== null &&
    'userExists' in response &&
    typeof response.userExists === 'boolean'
  ) {
    return response.userExists
  }
  const error = new PerpsError(
    PerpsErrorCode.ThirdPartyError,
    'Hyperliquid preTransferCheck response has no boolean userExists field'
  )
  error.tool = PROVIDER_KEY
  throw error
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
export const getAccountExists = (
  { client, apiUrl }: HyperliquidContext,
  params: GetAccountExistsParams,
  options?: SDKRequestOptions
): Promise<boolean> =>
  readAccountExists(apiUrl, params.address, hlInfoOptions(client, options))

export async function requireAccountExists(
  apiUrl: string,
  address: Address,
  options?: InfoRequestOptions
): Promise<void> {
  if (await readAccountExists(apiUrl, address, options)) {
    return
  }
  const error = new PerpsError(
    PerpsErrorCode.AccountNotFound,
    `No Hyperliquid account found for address: ${address}`
  )
  error.tool = PROVIDER_KEY
  throw error
}
