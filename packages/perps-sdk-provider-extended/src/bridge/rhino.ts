import { PerpsError } from '@lifi/perps-sdk'
import { type Address, PerpsErrorCode } from '@lifi/perps-types'
import type { ExtendedApiClient } from '../utils/apiClient.js'

/**
 * Get a Rhino.fi bridge quote from Extended and commit it, and give its id.
 * Extended ties the quote to the account of `apiKey`. A quote expires about
 * two minutes after it is created, so the caller uses the id at once.
 *
 * @internal
 */
export async function commitBridgeQuote(
  client: ExtendedApiClient,
  apiKey: string,
  route: { chainIn: string; chainOut: string; amount: string }
): Promise<string> {
  const query = new URLSearchParams(route).toString()
  const quote = await client.send<{ id: string }>(
    'GET',
    `/api/v1/user/bridge/quote?${query}`,
    { apiKey }
  )
  await client.send(
    'POST',
    `/api/v1/user/bridge/quote?id=${encodeURIComponent(quote.id)}`,
    { apiKey }
  )
  return quote.id
}

/**
 * The Rhino.fi bridge contract that Extended names for `chain`.
 *
 * @throws {PerpsError} `SDKError` when Extended names no contract for it.
 * @internal
 */
export async function readBridgeContract(
  client: ExtendedApiClient,
  apiKey: string,
  chain: string
): Promise<Address> {
  const config = await client.send<{
    chains: { chain: string; contractAddress: Address }[]
  }>('GET', '/api/v1/user/bridge/config', { apiKey })
  const entry = config.chains.find((candidate) => candidate.chain === chain)
  if (entry === undefined) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Extended names no bridge contract for chain ${chain}.`
    )
  }
  return entry.contractAddress
}

/**
 * The Starknet address that receives a withdrawal to an EVM chain: the
 * account's own bridge address, which Extended reports with the account.
 *
 * @internal
 */
export async function readBridgeRecipient(
  client: ExtendedApiClient,
  apiKey: string
): Promise<string> {
  const account = await client.send<{ bridgeStarknetAddress?: string }>(
    'GET',
    '/api/v1/user/account/info',
    { apiKey }
  )
  if (account.bridgeStarknetAddress === undefined) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'Extended reports no bridge address for this account.'
    )
  }
  return account.bridgeStarknetAddress
}
