import { readValidatedRecord, type StorageAdapter } from '@lifi/perps-sdk'
import type { LighterProviderKey } from '@lifi/perps-types'
import type { Address } from 'viem'
import { LIGHTER_PROVIDER_KEY } from '../constants.js'

// The private key here is a Lighter custom keypair — generated via WASM
// GenerateAPIKey — not an Ethereum private key. The storage key is namespaced
// by the resolved provider instance key so two Lighter instances sharing a
// storage adapter (e.g. `lighter` and `lighter-rh`) never clobber each other's
// API key.

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
  private providerKey: LighterProviderKey

  constructor(
    storage: StorageAdapter,
    providerKey: LighterProviderKey = LIGHTER_PROVIDER_KEY
  ) {
    this.storage = storage
    this.providerKey = providerKey
  }

  /**
   * Bind the resolved provider instance key. {@link LighterProvider} calls this
   * during registration so a consumer-constructed keystore adopts the plugin
   * instance's identity without pre-namespacing the adapter.
   * @internal
   */
  bindProviderKey(providerKey: LighterProviderKey): void {
    this.providerKey = providerKey
  }

  // The default instance keeps the legacy, un-namespaced key so existing
  // `lighter` users are not orphaned; only additional instances get a segment.
  private storageKey(address: Address): string {
    const lower = address.toLowerCase()
    return this.providerKey === LIGHTER_PROVIDER_KEY
      ? `${STORAGE_PREFIX}:${lower}`
      : `${STORAGE_PREFIX}:${this.providerKey}:${lower}`
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
