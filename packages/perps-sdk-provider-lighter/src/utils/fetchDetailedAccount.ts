import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { Address } from 'viem'
import { LIGHTER_CODE_ACCOUNT_NOT_FOUND } from '../constants.js'
import type { LtAccount, LtDetailedAccount } from '../types/index.js'
import type { LighterApiClient } from './apiClient.js'
import { wireList } from './wireList.js'

/**
 * Look up the Lighter account for an L1 address via `/api/v1/account`,
 * discriminating Lighter's account-not-found body code from generic failures.
 * The returned account carries real arrays for `positions` and `assets`.
 *
 * @public
 */
export const fetchDetailedAccount = async (
  client: LighterApiClient,
  address: Address
): Promise<LtAccount> => {
  const { status, data } = await client.getWithStatus<{
    code: number
    accounts?: LtDetailedAccount[] | null
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

  const accounts = wireList(data?.accounts)
  const account = accounts[0]
  if (account === undefined) {
    throw new PerpsError(
      PerpsErrorCode.AccountNotFound,
      `No Lighter account found for address: ${address}`
    )
  }
  return {
    ...account,
    positions: wireList(account.positions),
    assets: wireList(account.assets),
  }
}
