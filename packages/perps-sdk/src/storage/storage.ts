import type { StorageAdapter } from './types.js'

/**
 * localStorage adapter for browser environments. Falls back to a no-op when
 * `localStorage` is unavailable (e.g. SSR).
 */
export const localStorageAdapter: StorageAdapter = {
  get: (key: string): Promise<string | null> => {
    try {
      return Promise.resolve(localStorage.getItem(key))
    } catch {
      return Promise.resolve(null)
    }
  },

  set: (key: string, value: string): Promise<void> => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // localStorage not available
    }
    return Promise.resolve()
  },

  remove: (key: string): Promise<void> => {
    try {
      localStorage.removeItem(key)
    } catch {
      // localStorage not available
    }
    return Promise.resolve()
  },
}

/**
 * In-memory storage adapter for testing or server-side use.
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
