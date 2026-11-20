import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { Address } from 'viem'
import { LIGHTER_CODE_ACCOUNT_NOT_FOUND } from '../constants.js'
import type { LtAccount, LtDetailedAccount } from '../types/index.js'
import { type LighterApiClient, lighterBodyExcerpt } from './apiClient.js'
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
      `Lighter account request failed: ${status} — ${lighterBodyExcerpt(data)}`
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

interface PendingAccountRead {
  readonly account: Promise<LtAccount>
  readonly controller: AbortController
  consumers: number
}

/**
 * Share one {@link fetchDetailedAccount} request sequence among the concurrent
 * reads of an address. A settled read is not reused, so a later read sends a
 * fresh request. An aborted read rejects alone; the shared request aborts only
 * when every read that joined it aborts.
 *
 * @param clientFor - Builds the client of a new shared request on its own signal.
 * @internal
 */
export const createSharedAccountRead = (
  clientFor: (signal: AbortSignal) => LighterApiClient
): ((address: Address, signal?: AbortSignal) => Promise<LtAccount>) => {
  const pending = new Map<string, PendingAccountRead>()

  const fetchSharedAccount = (
    key: string,
    address: Address
  ): PendingAccountRead => {
    const controller = new AbortController()
    const read: PendingAccountRead = {
      controller,
      consumers: 0,
      account: fetchDetailedAccount(
        clientFor(controller.signal),
        address
      ).finally(() => {
        if (pending.get(key) === read) {
          pending.delete(key)
        }
      }),
    }
    pending.set(key, read)
    return read
  }

  return (address, signal) => {
    if (signal?.aborted) {
      return Promise.reject(signal.reason)
    }
    // Lighter matches `l1_address` case-insensitively, so every casing gets the same account.
    const key = address.toLowerCase()
    const read = pending.get(key) ?? fetchSharedAccount(key, address)
    read.consumers += 1
    if (signal === undefined) {
      return read.account
    }
    return new Promise<LtAccount>((resolve, reject) => {
      const leave = (): void => {
        read.consumers -= 1
        if (read.consumers === 0) {
          if (pending.get(key) === read) {
            pending.delete(key)
          }
          read.controller.abort(signal.reason)
        }
        reject(signal.reason)
      }
      signal.addEventListener('abort', leave, { once: true })
      read.account
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', leave))
    })
  }
}
