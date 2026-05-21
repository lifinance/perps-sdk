import type { Address, Hex } from '@lifi/perps-types'

/**
 * Agent keypair for signing trading actions.
 */
export interface Agent {
  /** Agent wallet address */
  address: Address
  /** Agent private key */
  privateKey: Hex
}

/**
 * Storage adapter interface for persisting agent keys.
 * Implement this interface to use custom storage (e.g., encrypted storage, database).
 */
export interface StorageAdapter {
  /** Get a value by key */
  get(key: string): Promise<string | null>
  /** Set a value by key */
  set(key: string, value: string): Promise<void>
  /** Remove a value by key */
  remove(key: string): Promise<void>
}
