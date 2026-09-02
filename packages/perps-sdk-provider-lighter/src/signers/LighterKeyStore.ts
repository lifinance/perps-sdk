import {
  PerpsError,
  readValidatedRecord,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import { type LighterProviderKey, PerpsErrorCode } from '@lifi/perps-types'
import type { Address } from 'viem'
import { LIGHTER_PROVIDER_KEY } from '../constants.js'

// The private key here is a Lighter custom keypair — generated via WASM
// GenerateAPIKey — not an Ethereum private key.

const STORAGE_PREFIX = 'lifi-perps-lighter-key'

/**
 * Persisted Lighter API-key material associated with one L2 account.
 * `apiKeyPrivateKey` is a Lighter-native signing key, not an Ethereum key;
 * `apiKeyIndex` identifies its registered on-chain slot.
 *
 * @public
 */
export interface LighterApiKey {
  /**
   * Lighter instance the record belongs to. A record read by any other
   * instance is discarded, so its key material never signs on a chain that
   * does not hold it.
   */
  providerKey: LighterProviderKey
  /** Lighter account index, looked up once via accountsByL1Address. */
  accountIndex: number
  /** API key slot (0-255), as named by the backend registration payload. */
  apiKeyIndex: number
  /** Lighter-native private key (0x-prefixed hex). */
  apiKeyPrivateKey: string
  /** Corresponding public key, registered via ChangePubKey. */
  apiKeyPublicKey: string
  /** Referral code confirmed by the standard-token SET_REFERRAL action. */
  appliedReferralCode?: string
}

const isLighterApiKeyOf =
  (owner: LighterProviderKey) =>
  (value: unknown): value is LighterApiKey => {
    if (typeof value !== 'object' || value === null) {
      return false
    }
    const {
      providerKey,
      accountIndex,
      apiKeyIndex,
      apiKeyPrivateKey,
      apiKeyPublicKey,
      appliedReferralCode,
    } = value as Record<string, unknown>
    return (
      providerKey === owner &&
      typeof accountIndex === 'number' &&
      Number.isFinite(accountIndex) &&
      typeof apiKeyIndex === 'number' &&
      Number.isFinite(apiKeyIndex) &&
      typeof apiKeyPrivateKey === 'string' &&
      apiKeyPrivateKey.length > 0 &&
      typeof apiKeyPublicKey === 'string' &&
      apiKeyPublicKey.length > 0 &&
      (appliedReferralCode === undefined ||
        (typeof appliedReferralCode === 'string' &&
          appliedReferralCode.length > 0))
    )
  }

/**
 * Storage-backed cache for Lighter API keys. Records are namespaced by L1
 * address and provider instance, and each record names its own instance, so
 * multiple Lighter deployments can share one {@link StorageAdapter} and no
 * instance ever reads another instance's key material.
 *
 * @public
 */
export class LighterKeyStore {
  private readonly storage: StorageAdapter
  private readonly cache = new Map<string, LighterApiKey>()
  private providerKey: LighterProviderKey

  /**
   * Create a key store using `storage` and the optional provider namespace.
   * The default provider key preserves the package's standard Lighter storage
   * namespace.
   */
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

  // The default instance keeps the legacy, un-namespaced slot name; only
  // additional instances get a segment.
  private storageKey(address: Address): string {
    const lower = address.toLowerCase()
    return this.providerKey === LIGHTER_PROVIDER_KEY
      ? `${STORAGE_PREFIX}:${lower}`
      : `${STORAGE_PREFIX}:${this.providerKey}:${lower}`
  }

  /**
   * Load the API key for an L1 address, or `null` when no valid record exists.
   * Invalid persisted records are ignored by the storage validation boundary.
   */
  async get(address: Address): Promise<LighterApiKey | null> {
    const key = this.storageKey(address)
    const cached = this.cache.get(key)
    if (cached) {
      return cached
    }
    const parsed = await readValidatedRecord(
      this.storage,
      key,
      isLighterApiKeyOf(this.providerKey)
    )
    if (!parsed) {
      return null
    }
    this.cache.set(key, parsed)
    return parsed
  }

  /**
   * Persist an API key for an L1 address, replacing any existing record under
   * that provider namespace. The store stamps the record with its own instance
   * key, so callers never name the instance themselves.
   */
  async set(
    address: Address,
    value: Omit<LighterApiKey, 'providerKey'>
  ): Promise<void> {
    const key = this.storageKey(address)
    const record: LighterApiKey = { ...value, providerKey: this.providerKey }
    this.cache.set(key, record)
    await this.storage.set(key, JSON.stringify(record))
  }

  async markReferralApplied(
    address: Address,
    appliedReferralCode: string
  ): Promise<void> {
    const current = await this.get(address)
    if (current === null) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Cannot persist the Lighter referral marker without an API key for ${address}`
      )
    }
    const { providerKey: _providerKey, ...value } = current
    await this.set(address, { ...value, appliedReferralCode })
  }

  /**
   * Remove the persisted API key for an L1 address and clear its in-memory
   * cache entry.
   */
  async remove(address: Address): Promise<void> {
    const key = this.storageKey(address)
    this.cache.delete(key)
    await this.storage.remove(key)
  }
}
