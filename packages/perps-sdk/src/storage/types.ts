/**
 * Asynchronous key-value storage for SDK session credentials (provider agent
 * keypairs, API keys, and read-only tokens). Values are opaque strings; an
 * adapter should preserve them exactly and return `null` when a key is absent.
 * Implement this interface for encrypted storage, a database, or another
 * application-owned store.
 *
 * @public
 */
export interface StorageAdapter {
  /** Read the value for `key`, or `null` when the key is absent. */
  get(key: string): Promise<string | null>
  /** Persist `value` under `key`, replacing any existing value. */
  set(key: string, value: string): Promise<void>
  /** Remove `key`; resolving successfully when it is already absent. */
  remove(key: string): Promise<void>
}
