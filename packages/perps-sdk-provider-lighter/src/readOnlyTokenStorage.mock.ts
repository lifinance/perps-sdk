import { createMemoryStorage, type StorageAdapter } from '@lifi/perps-sdk'
import { LIGHTER_PROVIDER_KEY } from './constants.js'

interface StoredCredentials {
  address: string
  token: string
  accountIndex: number
  providerKey?: string
}

/** Year ~2096 in unix seconds — a read-only token expiry far past any test clock. */
const FAR_EXPIRY_SECONDS = 4_000_000_000

/** Stores a read-only token that auth-gated reads resolve without a create call. */
export const seedReadOnlyToken = async (
  storage: StorageAdapter,
  {
    address,
    token,
    accountIndex,
    providerKey = LIGHTER_PROVIDER_KEY,
  }: StoredCredentials
): Promise<StorageAdapter> => {
  await storage.set(
    `lifi:perps:${providerKey}:rotoken:${address.toLowerCase()}:${accountIndex}`,
    JSON.stringify({
      token,
      expiry: FAR_EXPIRY_SECONDS,
      scope: 'all',
      accountIndex,
      tokenId: 1,
    })
  )
  return storage
}

/**
 * Memory storage with a registered API key and a stored read-only token, so
 * the provider resolves `token` for auth-gated reads.
 */
export const storageWithReadOnlyToken = async (
  credentials: StoredCredentials
): Promise<StorageAdapter> => {
  const {
    address,
    accountIndex,
    providerKey = LIGHTER_PROVIDER_KEY,
  } = credentials
  const storage = createMemoryStorage()
  const keySegment =
    providerKey === LIGHTER_PROVIDER_KEY ? '' : `${providerKey}:`
  await storage.set(
    `lifi-perps-lighter-key:${keySegment}${address.toLowerCase()}`,
    JSON.stringify({
      accountIndex,
      apiKeyIndex: accountIndex,
      apiKeyPrivateKey: `0x${'cc'.repeat(32)}`,
      apiKeyPublicKey: `0x${'dd'.repeat(32)}`,
      providerKey,
    })
  )
  return seedReadOnlyToken(storage, { ...credentials, providerKey })
}
