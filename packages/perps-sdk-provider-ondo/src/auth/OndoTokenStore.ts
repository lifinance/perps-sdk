import { readValidatedRecord, type StorageAdapter } from '@lifi/perps-sdk'
import type { Address } from 'viem'
import type { OnAuthToken } from '../types/auth.js'

// Keys are namespaced by environment host as well as address: a production
// JWT is meaningless against the sandbox, and both stores may share one
// localStorage.

const STORAGE_PREFIX = 'lifi-perps-ondo-session'

const isOnAuthToken = (value: unknown): value is OnAuthToken => {
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
    newAccount,
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
    token.length > 0 &&
    typeof newAccount === 'boolean'
  )
}

const isExpired = (token: OnAuthToken): boolean =>
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
  private readonly cache = new Map<string, OnAuthToken>()

  constructor(storage: StorageAdapter, baseUrl: string) {
    this.storage = storage
    this.host = new URL(baseUrl).host
  }

  private storageKey(address: Address): string {
    return `${STORAGE_PREFIX}:${this.host}:${address.toLowerCase()}`
  }

  async get(address: Address): Promise<OnAuthToken | null> {
    const key = this.storageKey(address)
    const cached = this.cache.get(key)
    if (cached) {
      if (isExpired(cached)) {
        await this.remove(address)
        return null
      }
      return cached
    }
    const parsed = await readValidatedRecord(this.storage, key, isOnAuthToken)
    if (!parsed) {
      return null
    }
    if (isExpired(parsed)) {
      await this.remove(address)
      return null
    }
    this.cache.set(key, parsed)
    return parsed
  }

  async set(address: Address, token: OnAuthToken): Promise<void> {
    const key = this.storageKey(address)
    this.cache.set(key, token)
    await this.storage.set(key, JSON.stringify(token))
  }

  async remove(address: Address): Promise<void> {
    const key = this.storageKey(address)
    this.cache.delete(key)
    await this.storage.remove(key)
  }
}
