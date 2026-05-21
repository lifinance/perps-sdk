import type { Address } from '@lifi/perps-types'
import type { StorageAdapter } from '../../agent/types.js'

// ---------------------------------------------------------------------------
// LighterKeyStore
//
// Persists the Lighter-native API keypair plus account/key indices per L1
// user address. Unlike AgentManager, the private key here is a Lighter custom
// keypair — generated via WASM GenerateAPIKey — not an Ethereum private key.
//
// We namespace the storage key by provider (`lighter`) so the same user can
// later hold credentials for other WASM-blob providers without collision.
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'lifi-perps-lighter-key'
export const LIGHTER_PROVIDER_KEY = 'lighter'

/**
 * Default API key slot. Reusing one slot is deliberate: Lighter allows 256
 * slots per account but re-registering a slot overwrites the prior key, so
 * a fixed slot keeps storage small and recovery simple.
 */
export const DEFAULT_API_KEY_INDEX = 1

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
    const stored = await this.storage.get(key)
    if (!stored) {
      return null
    }
    const parsed = JSON.parse(stored) as LighterApiKey
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
