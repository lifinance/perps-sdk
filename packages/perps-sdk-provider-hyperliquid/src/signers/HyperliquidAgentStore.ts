import {
  localStorageAdapter,
  PerpsError,
  PerpsErrorMessage,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { PROVIDER_KEY } from '../constants.js'

const STORAGE_PREFIX = 'lifi-perps-agent'

/**
 * Hyperliquid agent keypair — an EVM keypair the user approves (via
 * `APPROVE_AGENT`) to sign trading actions on their behalf, so each order
 * does not require a wallet prompt.
 */
export interface HyperliquidAgent {
  /** Agent wallet address. */
  address: Address
  /** Agent private key. */
  privateKey: Hex
}

/**
 * Owns the Hyperliquid agent keypair lifecycle: generate, persist, look up,
 * and revoke. Keyed per user L1 address. Persisted via the injected
 * {@link StorageAdapter} (browser `localStorage` by default).
 */
export class HyperliquidAgentStore {
  private storage: StorageAdapter
  private cache: Map<string, HyperliquidAgent> = new Map()

  constructor(storage?: StorageAdapter) {
    this.storage = storage ?? localStorageAdapter
  }

  private storageKey(address: Address): string {
    return `${STORAGE_PREFIX}:${address.toLowerCase()}:${PROVIDER_KEY}`
  }

  /**
   * Get the existing agent for a user address.
   *
   * @throws {PerpsError} If no agent has been created yet.
   */
  async get(address: Address): Promise<HyperliquidAgent> {
    const key = this.storageKey(address)

    const cached = this.cache.get(key)
    if (cached) {
      return cached
    }

    const stored = await this.storage.get(key)
    if (stored) {
      const agent = JSON.parse(stored) as HyperliquidAgent
      this.cache.set(key, agent)
      return agent
    }

    const error = new PerpsError(
      PerpsErrorCode.SDKError,
      PerpsErrorMessage.AgentNotFound
    )
    error.tool = '@lifi/perps-sdk-provider-hyperliquid'
    throw error
  }

  /** Get the existing agent for a user address, or create and persist one. */
  async getOrCreate(address: Address): Promise<HyperliquidAgent> {
    try {
      return await this.get(address)
    } catch {
      const privateKey = generatePrivateKey()
      const account = privateKeyToAccount(privateKey)

      const agent: HyperliquidAgent = {
        address: account.address,
        privateKey,
      }

      const key = this.storageKey(address)
      await this.storage.set(key, JSON.stringify(agent))
      this.cache.set(key, agent)

      return agent
    }
  }

  /** Whether an agent exists for the user address. */
  async has(address: Address): Promise<boolean> {
    try {
      await this.get(address)
      return true
    } catch {
      return false
    }
  }

  /**
   * Remove the agent for a user address. Call when the user revokes agent
   * authorization.
   */
  async remove(address: Address): Promise<void> {
    const key = this.storageKey(address)
    this.cache.delete(key)
    await this.storage.remove(key)
  }

  /**
   * Import an existing agent keypair (e.g. restoring from backup or pinning a
   * specific key) and persist it.
   */
  async import(address: Address, privateKey: Hex): Promise<HyperliquidAgent> {
    const account = privateKeyToAccount(privateKey)

    const agent: HyperliquidAgent = {
      address: account.address,
      privateKey,
    }

    const key = this.storageKey(address)
    await this.storage.set(key, JSON.stringify(agent))
    this.cache.set(key, agent)

    return agent
  }

  /** Clear the in-memory cache. Does not remove persisted agents. */
  clearCache(): void {
    this.cache.clear()
  }
}
