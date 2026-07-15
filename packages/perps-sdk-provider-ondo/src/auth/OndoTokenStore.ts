import { readValidatedRecord, type StorageAdapter } from '@lifi/perps-sdk'
import type { Address } from 'viem'
import type { OndoAuthToken } from '../types/auth.js'

// Keys are namespaced by environment host as well as address: a production
// JWT is meaningless against the sandbox, and both stores may share one
// localStorage.

const STORAGE_PREFIX = 'lifi-perps-ondo-session'

const isOnAuthToken = (value: unknown): value is OndoAuthToken => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const {
    identifier,
    authType,
    accountId,
    issuedAtSecs,
    expirationSecs,
    token,
  } = value as Record<string, unknown>
  return (
    typeof identifier === 'string' &&
    typeof authType === 'string' &&
    typeof accountId === 'string' &&
    typeof issuedAtSecs === 'number' &&
    Number.isFinite(issuedAtSecs) &&
    typeof expirationSecs === 'number' &&
    Number.isFinite(expirationSecs) &&
    typeof token === 'string' &&
    token.length > 0
  )
}

const isExpired = (token: OndoAuthToken): boolean =>
  token.expirationSecs * 1000 <= Date.now()

/**
 * Persists the Ondo session token per wallet address and environment via a
 * `StorageAdapter`. An expired token reads back as absent (and is evicted),
 * so callers can treat `null` uniformly as "run the SIWE login".
 *
 * @public
 */
export class OndoTokenStore {
  private readonly storage: StorageAdapter
  private readonly host: string

  constructor(storage: StorageAdapter, baseUrl: string) {
    this.storage = storage
    this.host = new URL(baseUrl).host
  }

  private storageKey(address: Address): string {
    return `${STORAGE_PREFIX}:${this.host}:${address.toLowerCase()}`
  }

  // Reads go straight to storage — no in-memory cache — so every store
  // instance sharing a storage backend observes evictions immediately.
  async get(address: Address): Promise<OndoAuthToken | null> {
    const key = this.storageKey(address)
    const parsed = await readValidatedRecord(this.storage, key, isOnAuthToken)
    if (!parsed) {
      return null
    }
    if (isExpired(parsed)) {
      await this.remove(address)
      return null
    }
    return parsed
  }

  async set(address: Address, token: OndoAuthToken): Promise<void> {
    await this.storage.set(this.storageKey(address), JSON.stringify(token))
  }

  async remove(address: Address): Promise<void> {
    await this.storage.remove(this.storageKey(address))
  }
}
