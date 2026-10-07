import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { Address } from 'viem'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoAuthToken } from '../types/auth.js'
import type { OndoSessionExpiredError } from '../utils/apiClient.js'
import type { OndoTokenStore } from './OndoTokenStore.js'

/**
 * The `SetupRequired` error for an absent Ondo session. No venue request was
 * sent, so it is not the venue's `Unauthorized` verdict.
 *
 * @internal
 */
export const ondoSessionRequiredError = (message: string): PerpsError => {
  const error = new PerpsError(PerpsErrorCode.SetupRequired, message)
  error.tool = ONDO_PROVIDER_KEY
  return error
}

/**
 * The `Unauthorized` error for a session the venue rejected with a 401.
 * `read` names the failed operation in the message.
 *
 * @internal
 */
export const ondoSessionRejectedError = (
  read: string,
  cause: OndoSessionExpiredError
): PerpsError => {
  const error = new PerpsError(
    PerpsErrorCode.Unauthorized,
    `Ondo ${read} failed: the venue rejected the session; sign in again.`
  )
  error.tool = ONDO_PROVIDER_KEY
  error.cause = cause
  return error
}

/**
 * Return the stored session token, or throw {@link ondoSessionRequiredError}
 * when none is stored.
 *
 * @internal
 */
export const requireOndoSessionToken = async (
  tokenStore: OndoTokenStore,
  address: Address
): Promise<OndoAuthToken> => {
  const token = await tokenStore.get(address)
  if (token === null) {
    throw ondoSessionRequiredError(
      `No valid Ondo session token stored for ${address}. Run the SIWE login first.`
    )
  }
  return token
}
