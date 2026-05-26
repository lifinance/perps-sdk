import { PerpsErrorCode } from '@lifi/perps-types'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { PerpsErrorMessage } from '../errors/constants.js'
import { PerpsError } from '../errors/PerpsError.js'
import { localStorageAdapter } from './storage.js'
import type { Agent, StorageAdapter } from './types.js'

const STORAGE_PREFIX = 'lifi-perps-agent'

/**
 * Manages agent keypairs for USER_AGENT signing mode.
 * Agent keys are stored per user address + provider combination.
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
  private storageKey(address: Address, provider: string): string {
    return `${STORAGE_PREFIX}:${address.toLowerCase()}:${provider.toLowerCase()}`
  }

  /**
   * Get an existing agent for a user + provider pair.
   *
   * @throws {PerpsError} If agent not found
   */
  async getAgent(address: Address, provider: string): Promise<Agent> {
    const key = this.storageKey(address, provider)

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

    const error = new PerpsError(
      PerpsErrorCode.SDKError,
      PerpsErrorMessage.AgentNotFound
    )
    error.tool = '@lifi/perps-sdk'
    throw error
  }

  /**
   * Get an existing agent or create a new one.
   */
  async getOrCreateAgent(address: Address, provider: string): Promise<Agent> {
    try {
      return await this.getAgent(address, provider)
    } catch {
      // Generate new agent
      const privateKey = generatePrivateKey()
      const account = privateKeyToAccount(privateKey)

      const agent: Agent = {
        address: account.address,
        privateKey,
      }

      // Store
      const key = this.storageKey(address, provider)
      await this.storage.set(key, JSON.stringify(agent))
      this.cache.set(key, agent)

      return agent
    }
  }

  /**
   * Check if an agent exists for a user + provider pair.
   */
  async hasAgent(address: Address, provider: string): Promise<boolean> {
    try {
      await this.getAgent(address, provider)
      return true
    } catch {
      return false
    }
  }

  /**
   * Remove an agent for a user + provider pair.
   * Call this when the user revokes agent authorization.
   */
  async removeAgent(address: Address, provider: string): Promise<void> {
    const key = this.storageKey(address, provider)
    this.cache.delete(key)
    await this.storage.remove(key)
  }

  /**
   * Import an existing agent keypair.
   * Useful for restoring from backup or using a specific key.
   */
  async importAgent(
    address: Address,
    provider: string,
    privateKey: Hex
  ): Promise<Agent> {
    const account = privateKeyToAccount(privateKey)

    const agent: Agent = {
      address: account.address,
      privateKey,
    }

    const key = this.storageKey(address, provider)
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
