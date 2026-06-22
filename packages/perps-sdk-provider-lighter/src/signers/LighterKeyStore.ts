import { readValidatedRecord, type StorageAdapter } from '@lifi/perps-sdk'
import type { Address } from 'viem'

// The private key here is a Lighter custom keypair — generated via WASM
// GenerateAPIKey — not an Ethereum private key. The storage key is namespaced
// by provider (`lighter`) so the same user can hold credentials for other
// WASM-blob providers without collision.

const STORAGE_PREFIX = 'lifi-perps-lighter-key'

/** @public */
export interface LighterApiKey {
  /** Lighter account index, looked up once via accountsByL1Address. */
  accountIndex: number
  /** API key slot (0-255). Defaults to {@link DEFAULT_API_KEY_INDEX}. */
  apiKeyIndex: number
  /** Lighter-native private key (0x-prefixed hex). */
  apiKeyPrivateKey: string
  /** Corresponding public key, registered via ChangePubKey. */
  apiKeyPublicKey: string
}

const isLighterApiKey = (value: unknown): value is LighterApiKey => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const { accountIndex, apiKeyIndex, apiKeyPrivateKey, apiKeyPublicKey } =
    value as Record<string, unknown>
  return (
    typeof accountIndex === 'number' &&
    Number.isFinite(accountIndex) &&
    typeof apiKeyIndex === 'number' &&
    Number.isFinite(apiKeyIndex) &&
    typeof apiKeyPrivateKey === 'string' &&
    apiKeyPrivateKey.length > 0 &&
    typeof apiKeyPublicKey === 'string' &&
    apiKeyPublicKey.length > 0
  )
}

/** @public */
export class LighterKeyStore {
  private readonly storage: StorageAdapter
  private readonly cache = new Map<string, LighterApiKey>()

  constructor(storage: StorageAdapter) {
    this.storage = storage
  }

  private storageKey(address: Address): string {
    return `${STORAGE_PREFIX}:${address.toLowerCase()}`
  }

  async get(address: Address): Promise<LighterApiKey | null> {
    const key = this.storageKey(address)
    const cached = this.cache.get(key)
    if (cached) {
      return cached
    }
    const parsed = await readValidatedRecord(this.storage, key, isLighterApiKey)
    if (!parsed) {
      return null
    }
    this.cache.set(key, parsed)
    return parsed
  }

  async set(address: Address, value: LighterApiKey): Promise<void> {
    const key = this.storageKey(address)
    this.cache.set(key, value)
    await this.storage.set(key, JSON.stringify(value))
  }

  async remove(address: Address): Promise<void> {
    const key = this.storageKey(address)
    this.cache.delete(key)
    await this.storage.remove(key)
  }
}
