/**
 * Storage adapter interface for persisting SDK session credentials (provider
 * agent keypairs, API keys, read-only tokens). Implement this to use custom
 * storage (e.g. encrypted storage, a database, async key-value stores).
 */
export interface StorageAdapter {
  /** Get a value by key. */
  get(key: string): Promise<string | null>
  /** Set a value by key. */
  set(key: string, value: string): Promise<void>
  /** Remove a value by key. */
  remove(key: string): Promise<void>
}
