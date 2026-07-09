import type { PerpsClientSigner } from '@lifi/perps-sdk'
import type { Hex } from 'viem'
import type { OndoAuthToken } from '../types/auth.js'
import type { OndoApiClient } from '../utils/apiClient.js'

/**
 * SIWE challenge to sign, as issued by Ondo's `get_challenge`.
 *
 * @public
 */
export interface OndoSiweChallenge {
  id: string
  /** Plain-text ERC-4361 message; signed as-is via `personal_sign`. */
  message: string
}

/**
 * Sign a SIWE challenge with the user's wallet and exchange it for an Ondo
 * session token, directly against Ondo — the returned JWT never transits the
 * LI.FI backend. viem's `signMessage` performs the EIP-191 `personal_sign`
 * encoding Ondo verifies against. The signature is returned alongside the
 * token so callers can hand it back as a `SiweSignedActionStep`.
 *
 * @public
 */
export async function completeSiweLogin(
  client: OndoApiClient,
  signer: PerpsClientSigner,
  challenge: OndoSiweChallenge
): Promise<{ token: OndoAuthToken; signature: Hex }> {
  const signature = await signer.signMessage({
    account: signer.account,
    message: challenge.message,
  })
  const token = await client.post<OndoAuthToken>(
    '/v1/auth/erc-4361/login/complete_challenge',
    {
      id: challenge.id,
      signature,
    }
  )
  return { token, signature }
}
