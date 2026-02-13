import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { PerpsErrorMessage } from '../errors/constants.js'
import { PerpsError } from '../errors/PerpsError.js'
import type { Address, Hex } from '../types/perps.js'
import { PerpsErrorCode } from '../types/perps.js'
import { localStorageAdapter } from './storage.js'
import type { Agent, StorageAdapter } from './types.js'

const STORAGE_PREFIX = 'lifi-perps-agent'

/**
 * Manages agent keypairs for USER_AGENT signing mode.
 * Agent keys are stored per user address + DEX combination.
 */
export class AgentManager {
  private storage: StorageAdapter
  private cache: Map<string, Agent> = new Map()

  constructor(storage?: StorageAdapter) {
    this.storage = storage ?? localStorageAdapter
  }

  /**
   * Get the storage key for an agent.
   */
  private storageKey(address: Address, dex: string): string {
    return `${STORAGE_PREFIX}:${address.toLowerCase()}:${dex.toLowerCase()}`
  }

  /**
   * Get an existing agent for a user + DEX pair.
   *
   * @throws {PerpsError} If agent not found
   */
  async getAgent(address: Address, dex: string): Promise<Agent> {
    const key = this.storageKey(address, dex)

    // Check cache first
    const cached = this.cache.get(key)
    if (cached) {
      return cached
    }

    // Check storage
    const stored = await this.storage.get(key)
    if (stored) {
      const agent = JSON.parse(stored) as Agent
      this.cache.set(key, agent)
      return agent
    }

    throw new PerpsError(
      PerpsErrorCode.AgentUnauthorized,
      PerpsErrorMessage.AgentNotFound
    )
  }

  /**
   * Get an existing agent or create a new one.
   */
  async getOrCreateAgent(address: Address, dex: string): Promise<Agent> {
    try {
      return await this.getAgent(address, dex)
    } catch {
      // Generate new agent
      const privateKey = generatePrivateKey()
      const account = privateKeyToAccount(privateKey)

      const agent: Agent = {
        address: account.address,
        privateKey,
      }

      // Store
      const key = this.storageKey(address, dex)
      await this.storage.set(key, JSON.stringify(agent))
      this.cache.set(key, agent)

      return agent
    }
  }

  /**
   * Check if an agent exists for a user + DEX pair.
   */
  async hasAgent(address: Address, dex: string): Promise<boolean> {
    try {
      await this.getAgent(address, dex)
      return true
    } catch {
      return false
    }
  }

  /**
   * Remove an agent for a user + DEX pair.
   * Call this when the user revokes agent authorization.
   */
  async removeAgent(address: Address, dex: string): Promise<void> {
    const key = this.storageKey(address, dex)
    this.cache.delete(key)
    await this.storage.remove(key)
  }

  /**
   * Import an existing agent keypair.
   * Useful for restoring from backup or using a specific key.
   */
  async importAgent(
    address: Address,
    dex: string,
    privateKey: Hex
  ): Promise<Agent> {
    const account = privateKeyToAccount(privateKey)

    const agent: Agent = {
      address: account.address,
      privateKey,
    }

    const key = this.storageKey(address, dex)
    await this.storage.set(key, JSON.stringify(agent))
    this.cache.set(key, agent)

    return agent
  }

  /**
   * Clear all cached agents.
   * Does not remove from storage.
   */
  clearCache(): void {
    this.cache.clear()
  }
}
