import type { StorageAdapter } from './types.js'

/**
 * In-memory storage adapter for testing or server-side use.
 *
 * @public
 */
export function createMemoryStorage(): StorageAdapter {
  const store = new Map<string, string>()

  return {
    get: (key: string): Promise<string | null> => {
      return Promise.resolve(store.get(key) ?? null)
    },

    set: (key: string, value: string): Promise<void> => {
      store.set(key, value)
      return Promise.resolve()
    },

    remove: (key: string): Promise<void> => {
      store.delete(key)
      return Promise.resolve()
    },
  }
}
