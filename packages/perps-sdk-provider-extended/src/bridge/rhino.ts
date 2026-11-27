import { PerpsError } from '@lifi/perps-sdk'
import { type Address, PerpsErrorCode } from '@lifi/perps-types'
import { isAddress } from 'viem'
import type { ExtendedApiClient } from '../utils/apiClient.js'

/** The highest Rhino.fi bridge fee, in USDC, that the SDK commits to. */
export const MAX_BRIDGE_FEE_USDC = 2

/**
 * Get a Rhino.fi bridge quote from Extended and commit it, and give its id.
 * Extended ties the quote to the account of `apiKey`. A quote expires about
 * two minutes after it is created, so the caller uses the id at once.
 *
 * @throws {PerpsError} `SDKError` when the quote's fee is missing or above
 *   `MAX_BRIDGE_FEE_USDC`. The quote is then not committed.
 * @internal
 */
export async function commitBridgeQuote(
  client: ExtendedApiClient,
  apiKey: string,
  route: { chainIn: string; chainOut: string; amount: string }
): Promise<string> {
  const query = new URLSearchParams(route).toString()
  const quote = await client.send<{ id: string; fee?: unknown }>(
    'GET',
    `/api/v1/user/bridge/quote?${query}`,
    { apiKey }
  )
  const fee =
    typeof quote.fee === 'string' && /^\d+(\.\d+)?$/.test(quote.fee)
      ? Number(quote.fee)
      : Number.NaN
  if (!(fee <= MAX_BRIDGE_FEE_USDC)) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `The Rhino.fi bridge quote has a fee of ${String(quote.fee)} USDC, above the ${MAX_BRIDGE_FEE_USDC} USDC limit or unreadable.`
    )
  }
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
  const config = await client.send<{ chains?: unknown } | null>(
    'GET',
    '/api/v1/user/bridge/config',
    { apiKey }
  )
  const chains: unknown[] = Array.isArray(config?.chains) ? config.chains : []
  const entry = chains.find(
    (candidate): candidate is { contractAddress?: unknown } =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'chain' in candidate &&
      candidate.chain === chain
  )
  const contract = entry?.contractAddress
  if (typeof contract !== 'string' || !isAddress(contract)) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Extended names no bridge contract for chain ${chain}.`
    )
  }
  return contract
}

const STARK_ADDRESS = /^(0x[0-9a-fA-F]+|\d+)$/

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
  const account = await client.send<{ bridgeStarknetAddress?: unknown } | null>(
    'GET',
    '/api/v1/user/account/info',
    { apiKey }
  )
  const address = account?.bridgeStarknetAddress
  if (
    typeof address !== 'string' ||
    !STARK_ADDRESS.test(address) ||
    BigInt(address) === 0n
  ) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'Extended reports no bridge address for this account.'
    )
  }
  return address
}
