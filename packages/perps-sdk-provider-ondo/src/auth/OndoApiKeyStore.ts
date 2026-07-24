import { readValidatedRecord, type StorageAdapter } from '@lifi/perps-sdk'
import type { Address } from 'viem'
import type { OndoApiKey } from '../types/auth.js'

// Keys are namespaced by environment host as well as address: a production
// API key is meaningless against the sandbox, and both stores may share one
// localStorage.

const STORAGE_PREFIX = 'lifi-perps-ondo-apikey'

/** @internal */
export const isOndoApiKey = (value: unknown): value is OndoApiKey => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const { keyId, apiSecret, name, createdAt, scopes } = value as Record<
    string,
    unknown
  >
  return (
    typeof keyId === 'string' &&
    keyId.length > 0 &&
    typeof apiSecret === 'string' &&
    apiSecret.length > 0 &&
    typeof name === 'string' &&
    typeof createdAt === 'string' &&
    Array.isArray(scopes) &&
    scopes.every((scope) => typeof scope === 'string')
  )
}

/**
 * Persists the Ondo trading API key per wallet address and environment via a
 * `StorageAdapter`, mirroring {@link OndoTokenStore}. The record holds the
 * `apiSecret` returned only at creation; a poisoned record reads back as absent
 * (and is evicted), so callers can treat `null` uniformly as "register a key".
 *
 * @public
 */
export class OndoApiKeyStore {
  private readonly storage: StorageAdapter
  private readonly host: string

  constructor(storage: StorageAdapter, baseUrl: string) {
    this.storage = storage
    this.host = new URL(baseUrl).host
  }

  private storageKey(address: Address): string {
    return `${STORAGE_PREFIX}:${this.host}:${address.toLowerCase()}`
  }

  async get(address: Address): Promise<OndoApiKey | null> {
    const key = this.storageKey(address)
    return (await readValidatedRecord(this.storage, key, isOndoApiKey)) ?? null
  }

  async set(address: Address, apiKey: OndoApiKey): Promise<void> {
    await this.storage.set(this.storageKey(address), JSON.stringify(apiKey))
  }

  async remove(address: Address): Promise<void> {
    await this.storage.remove(this.storageKey(address))
  }
}
