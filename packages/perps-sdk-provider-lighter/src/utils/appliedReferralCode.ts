import type { Address } from 'viem'
import type { LighterApiClient } from './apiClient.js'

// `used_code` is the referral currently applied to the account (empty string
// when none). Keyed by L1 address, mirroring Lighter's `/referral/use` write
// contract.
export async function fetchAppliedReferralCode(
  client: LighterApiClient,
  l1Address: Address,
  authToken: string
): Promise<string> {
  const { used_code } = await client.getAuthed<{ used_code: string }>(
    '/api/v1/referral/userReferrals',
    authToken,
    { l1_address: l1Address.toLowerCase() }
  )
  return used_code
}
