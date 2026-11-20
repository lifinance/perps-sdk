import { readValidatedRecord, type StorageAdapter } from '@lifi/perps-sdk'
import type { Address, Hex } from '@lifi/perps-types'

const STORAGE_PREFIX = 'lifi-perps-extended-credentials'

/**
 * The client-held credentials of one Extended account. None of them leaves
 * the client: the Stark key signs settlements, and the API key authorizes
 * each account request.
 *
 * @public
 */
export interface ExtendedCredentials {
  starkPrivateKey: Hex
  starkPublicKey: Hex
  /** Extended account id, sent as `X-X10-ACTIVE-ACCOUNT` at API-key creation. */
  accountId: string
  /** Starknet position id (Extended's `l2Vault`) that the settlements sign for. */
  positionId: string
  apiKey: string
}

const isHex = (value: unknown): value is Hex =>
  typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

/** @internal */
export const isExtendedCredentials = (
  value: unknown
): value is ExtendedCredentials => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const { starkPrivateKey, starkPublicKey, accountId, positionId, apiKey } =
    value as Record<string, unknown>
  return (
    isHex(starkPrivateKey) &&
    isHex(starkPublicKey) &&
    isNonEmptyString(accountId) &&
    isNonEmptyString(positionId) &&
    isNonEmptyString(apiKey)
  )
}

/**
 * Persists {@link ExtendedCredentials} per wallet address and Extended host
 * through a `StorageAdapter`. A record that fails validation reads back as
 * absent and is removed, so `null` always means "run the setup".
 *
 * @public
 */
export class ExtendedCredentialStore {
  private readonly storage: StorageAdapter
  private readonly host: string

  constructor(storage: StorageAdapter, baseUrl: string) {
    this.storage = storage
    this.host = new URL(baseUrl).host
  }

  private storageKey(address: Address): string {
    return `${STORAGE_PREFIX}:${this.host}:${address.toLowerCase()}`
  }

  get(address: Address): Promise<ExtendedCredentials | null> {
    return readValidatedRecord(
      this.storage,
      this.storageKey(address),
      isExtendedCredentials
    )
  }

  async set(address: Address, credentials: ExtendedCredentials): Promise<void> {
    await this.storage.set(
      this.storageKey(address),
      JSON.stringify(credentials)
    )
  }

  async remove(address: Address): Promise<void> {
    await this.storage.remove(this.storageKey(address))
  }
}
