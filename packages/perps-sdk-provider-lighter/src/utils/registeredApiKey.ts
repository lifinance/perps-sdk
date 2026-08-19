import type { LighterApiClient } from './apiClient.js'

/**
 * One entry of Lighter's `/api/v1/apikeys` response: the public key the venue
 * holds in an API-key slot.
 *
 * @internal
 */
export interface LighterRegisteredApiKey {
  api_key_index: number
  public_key: string
}

/** Compare Lighter public keys irrespective of `0x` prefix / casing. */
export const normalizeLighterPublicKey = (key: string): string =>
  key.replace(/^0x/i, '').toLowerCase()

/**
 * Read the public key Lighter holds in one API-key slot. Returns `undefined`
 * when the response carries no entry for `apiKeyIndex`.
 *
 * @internal
 */
export const fetchRegisteredApiKey = async (
  client: LighterApiClient,
  accountIndex: number,
  apiKeyIndex: number
): Promise<LighterRegisteredApiKey | undefined> => {
  const response = await client.get<{
    code: number
    api_keys: LighterRegisteredApiKey[]
  }>('/api/v1/apikeys', { account_index: accountIndex })
  return response.api_keys?.find((k) => k.api_key_index === apiKeyIndex)
}
