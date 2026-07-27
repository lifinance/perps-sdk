import { type Address, isAddress } from 'viem'
import type { OndoApiClient } from './apiClient.js'
import { OndoApiError } from './apiClient.js'

/** The only deposit policy supported by the Ondo provider. */
export const ONDO_DEPOSIT_POLICY = {
  network: 'ethereum',
  symbol: 'USDC',
  depositDestination: { wallet: 'margin' },
} as const

/** @internal */
export type OndoDepositPolicyMarker = {
  network: 'ethereum'
  symbol: 'USDC'
  depositDestination: { wallet: 'margin' }
}

/** @internal */
export interface OndoDepositAddressRecord {
  address: string
  coin: string
  network: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const malformed = (message: string): OndoApiError =>
  new OndoApiError(`Ondo deposit-address response is malformed: ${message}`)

const entriesFromResult = (result: unknown): unknown[] => {
  if (Array.isArray(result)) {
    return result
  }
  if (isRecord(result)) {
    for (const key of ['addresses', 'deposit_addresses', 'depositAddresses']) {
      if (Array.isArray(result[key])) {
        return result[key]
      }
    }
  }
  throw malformed('expected an address array')
}

/**
 * Extract the canonical Ethereum USDC address from Ondo's list response.
 * An empty list is a valid, unsatisfied setup state; malformed records are
 * errors so an API/schema failure cannot be mistaken for an absent address.
 */
export const parseOndoDepositAddress = (result: unknown): Address | null => {
  const entries = entriesFromResult(result)
  for (const entry of entries) {
    if (!isRecord(entry)) {
      throw malformed('address entries must be objects')
    }
    const coin = entry.coin ?? entry.symbol
    const network = entry.network
    if (typeof coin !== 'string' || typeof network !== 'string') {
      throw malformed('address entries require coin and network')
    }
    if (coin.toUpperCase() !== 'USDC' || network.toLowerCase() !== 'ethereum') {
      continue
    }
    if (typeof entry.address !== 'string' || !isAddress(entry.address)) {
      throw malformed('the Ethereum USDC entry has an invalid address')
    }
    return entry.address
  }
  return null
}

/** Query Ondo's authenticated Ethereum USDC deposit-address list. */
export const listOndoDepositAddress = async (
  client: OndoApiClient,
  authToken: string
): Promise<Address | null> =>
  parseOndoDepositAddress(
    await client.post<unknown>(
      '/v1/wallet/deposit_address/list',
      { coins: ['USDC'], network: 'ethereum' },
      { authToken }
    )
  )

const policyCandidate = (marker: object): Record<string, unknown> => {
  if (!isRecord(marker)) {
    throw malformed('session marker must be an object')
  }
  const candidate = marker.policy
  if (candidate === undefined) {
    return marker
  }
  if (!isRecord(candidate)) {
    throw malformed('session policy must be an object')
  }
  return candidate
}

/**
 * Validate the backend's minimal client-only marker and hydrate the venue
 * request with the authenticated account ID. The marker is validated against
 * the one fixed Ondo policy before any venue write is attempted.
 */
export const buildOndoProvisionPayload = (
  marker: object,
  accountID: string
): Record<string, unknown> => {
  if (typeof accountID !== 'string' || accountID.length === 0) {
    throw malformed('accountID is missing from /v1/account')
  }
  const candidate = policyCandidate(marker)
  const network = candidate.network
  const symbol = candidate.symbol
  const destination =
    candidate.depositDestination ?? candidate.deposit_destination
  if (network !== 'ethereum' || symbol !== 'USDC' || !isRecord(destination)) {
    throw malformed('unsupported deposit policy')
  }
  if (destination.wallet !== 'margin') {
    throw malformed('unsupported deposit wallet')
  }
  return {
    network: 'ethereum',
    symbol: 'USDC',
    deposit_destination: { id: accountID, wallet: 'margin' },
  }
}
