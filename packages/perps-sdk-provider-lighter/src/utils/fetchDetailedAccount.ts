import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { Address } from 'viem'
import { LIGHTER_CODE_ACCOUNT_NOT_FOUND } from '../constants.js'
import type { LtDetailedAccount } from '../types/index.js'
import type { LighterApiClient } from './apiClient.js'

/**
 * Look up the Lighter account for an L1 address via `/api/v1/account`,
 * discriminating Lighter's account-not-found body code from generic failures.
 *
 * @public
 */
export const fetchDetailedAccount = async (
  client: LighterApiClient,
  address: Address
): Promise<LtDetailedAccount> => {
  const { status, data } = await client.getWithStatus<{
    code: number
    accounts?: LtDetailedAccount[]
    message?: string
  }>('/api/v1/account', { by: 'l1_address', value: address })

  if (status === 400 && data?.code === LIGHTER_CODE_ACCOUNT_NOT_FOUND) {
    throw new PerpsError(
      PerpsErrorCode.AccountNotFound,
      `No Lighter account found for address: ${address}`
    )
  }

  if (status < 200 || status >= 300) {
    throw new PerpsError(
      PerpsErrorCode.ThirdPartyError,
      `Lighter account request failed: ${status} — ${JSON.stringify(data).slice(0, 200)}`
    )
  }

  const accounts = data?.accounts
  if (accounts === undefined || accounts.length === 0) {
    throw new PerpsError(
      PerpsErrorCode.AccountNotFound,
      `No Lighter account found for address: ${address}`
    )
  }
  return accounts[0]
}
