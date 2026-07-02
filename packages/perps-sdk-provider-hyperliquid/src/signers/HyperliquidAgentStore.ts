import {
  localStorageAdapter,
  PerpsError,
  PerpsErrorMessage,
  parseStoredRecord,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { type Address, type Hex, isAddress, isHex } from 'viem'
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

const isParsablePrivateKey = (value: unknown): value is Hex => {
  if (!isHex(value)) {
    return false
  }
  try {
    privateKeyToAccount(value)
    return true
  } catch {
    return false
  }
}

const isHyperliquidAgent = (value: unknown): value is HyperliquidAgent => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const { address, privateKey } = value as Record<string, unknown>
  return (
    typeof address === 'string' &&
    isAddress(address) &&
    isParsablePrivateKey(privateKey)
  )
}

/**
 * Owns the Hyperliquid agent keypair lifecycle: generate, persist, look up,
 * and revoke. Keyed per user L1 address. Persisted via the injected
 * {@link StorageAdapter} (browser `localStorage` by default).
 *
 * @security The default adapter is browser `localStorage`, so the stored agent
 * private key is readable by any same-origin script (e.g. via XSS). Pass a more
 * secure {@link StorageAdapter} to the constructor to harden this. Blast radius
 * is limited to agent trading: fund withdrawal still requires L1 `APPROVE_AGENT`
 * consent that the agent key alone cannot grant.
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
   * @throws {PerpsError} `AgentNotFound` when no agent exists, or
   * `AgentStorageCorrupt` when a record is present but malformed (so callers
   * never act on a structurally-invalid keypair, and `getOrCreate` does not
   * silently overwrite a poisoned-but-recoverable entry).
   */
  async get(address: Address): Promise<HyperliquidAgent> {
    const key = this.storageKey(address)

    const cached = this.cache.get(key)
    if (cached) {
      return cached
    }

    const stored = await this.storage.get(key)
    const agent = parseStoredRecord(stored, isHyperliquidAgent)
    if (agent) {
      this.cache.set(key, agent)
      return agent
    }

    const corrupt = stored !== null
    const error = new PerpsError(
      PerpsErrorCode.SDKError,
      corrupt
        ? PerpsErrorMessage.AgentStorageCorrupt
        : PerpsErrorMessage.AgentNotFound
    )
    error.tool = '@lifi/perps-sdk-provider-hyperliquid'
    throw error
  }

  /**
   * Get the existing agent for a user address, or create and persist one.
   * Regenerates only on genuine absence; a malformed stored record surfaces
   * as `AgentStorageCorrupt` rather than being overwritten with a fresh key.
   */
  async getOrCreate(address: Address): Promise<HyperliquidAgent> {
    try {
      return await this.get(address)
    } catch (error) {
      if (
        !(error instanceof PerpsError) ||
        error.message !== PerpsErrorMessage.AgentNotFound
      ) {
        throw error
      }
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
