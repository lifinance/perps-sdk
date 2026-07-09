import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StorageAdapter } from './types.js'

const IV_BYTE_LENGTH = 12

function createFakeLocalStorage() {
  const store = new Map<string, string>()
  return {
    store,
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      store.set(key, value)
    },
    removeItem: (key: string): void => {
      store.delete(key)
    },
  }
}

/**
 * Minimal in-memory `indexedDB` stand-in covering only the operations
 * {@link loadMasterKey} exercises: `open` (with a one-time `onupgradeneeded`),
 * and `get`/`put` on a single object store. Stores the real `CryptoKey` object
 * by reference, mirroring the structured-clone persistence the adapter relies
 * on.
 */
function createFakeIndexedDB() {
  const stores = new Map<string, Map<string, unknown>>()
  let dbCreated = false
  let openCount = 0

  function makeRequest<T>(execute: () => T) {
    const request: {
      onsuccess: (() => void) | null
      onerror: (() => void) | null
      result: T | undefined
      error: unknown
    } = { onsuccess: null, onerror: null, result: undefined, error: null }
    queueMicrotask(() => {
      try {
        request.result = execute()
        request.onsuccess?.()
      } catch (err) {
        request.error = err
        request.onerror?.()
      }
    })
    return request
  }

  const db = {
    createObjectStore(name: string) {
      if (!stores.has(name)) {
        stores.set(name, new Map())
      }
    },
    transaction(_name: string, _mode?: IDBTransactionMode) {
      return {
        objectStore(name: string) {
          let backing = stores.get(name)
          if (!backing) {
            backing = new Map()
            stores.set(name, backing)
          }
          const resolved = backing
          return {
            get: (key: string) => makeRequest(() => resolved.get(key)),
            put: (value: unknown, key: string) =>
              makeRequest(() => {
                resolved.set(key, value)
              }),
          }
        },
      }
    },
    close() {},
  }

  return {
    getOpenCount: () => openCount,
    open(_name: string, _version?: number) {
      openCount += 1
      const request: {
        onsuccess: (() => void) | null
        onerror: (() => void) | null
        onupgradeneeded: (() => void) | null
        result: typeof db
        error: unknown
      } = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: db,
        error: null,
      }
      queueMicrotask(() => {
        if (!dbCreated) {
          dbCreated = true
          request.onupgradeneeded?.()
        }
        request.onsuccess?.()
      })
      return request
    },
  }
}

async function loadAdapter(): Promise<StorageAdapter> {
  vi.resetModules()
  const mod = await import('./encryptedStorage.js')
  return mod.localStorageAdapter
}

function ivPrefix(base64: string): string {
  return atob(base64).slice(0, IV_BYTE_LENGTH)
}

describe('encrypted localStorageAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('round-trips a value through encryption', async () => {
    vi.stubGlobal('localStorage', createFakeLocalStorage())
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const adapter = await loadAdapter()

    await adapter.set('agent', '0xdeadbeefcafe')
    await expect(adapter.get('agent')).resolves.toBe('0xdeadbeefcafe')
  })

  it('returns null for a key that was never written', async () => {
    vi.stubGlobal('localStorage', createFakeLocalStorage())
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const adapter = await loadAdapter()

    await expect(adapter.get('missing')).resolves.toBeNull()
  })

  it('persists ciphertext, never the plaintext value', async () => {
    const ls = createFakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const adapter = await loadAdapter()

    const secret = '0x1234567890abcdef1234567890abcdef'
    await adapter.set('agent', secret)

    const stored = ls.store.get('agent')
    expect(stored).toBeDefined()
    expect(stored).not.toContain(secret)
  })

  it('uses a distinct IV per write', async () => {
    const ls = createFakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const adapter = await loadAdapter()

    await adapter.set('k1', 'same-value')
    await adapter.set('k2', 'same-value')

    const stored1 = ls.getItem('k1')
    const stored2 = ls.getItem('k2')
    expect(stored1).not.toBeNull()
    expect(stored2).not.toBeNull()
    expect(ivPrefix(stored1 ?? '')).not.toBe(ivPrefix(stored2 ?? ''))
  })

  it('uses a distinct IV on repeated writes to the same key', async () => {
    const ls = createFakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const adapter = await loadAdapter()

    await adapter.set('k', 'same-value')
    const first = ls.getItem('k')
    await adapter.set('k', 'same-value')
    const second = ls.getItem('k')

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(ivPrefix(first ?? '')).not.toBe(ivPrefix(second ?? ''))
  })

  it('resolves null for tampered ciphertext', async () => {
    const ls = createFakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const adapter = await loadAdapter()

    await adapter.set('k', 'secret-value')
    const stored = ls.getItem('k') ?? ''
    const mid = Math.floor(stored.length / 2)
    const flipped = stored[mid] === 'A' ? 'B' : 'A'
    ls.store.set('k', stored.slice(0, mid) + flipped + stored.slice(mid + 1))

    await expect(adapter.get('k')).resolves.toBeNull()
  })

  it('resolves null for truncated ciphertext', async () => {
    const ls = createFakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const adapter = await loadAdapter()

    await adapter.set('k', 'secret-value')
    ls.store.set('k', 'AAAA')

    await expect(adapter.get('k')).resolves.toBeNull()
  })

  it('resolves null for a non-base64 stored value', async () => {
    const ls = createFakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const adapter = await loadAdapter()

    ls.store.set('k', 'not!valid!base64!@@')
    await expect(adapter.get('k')).resolves.toBeNull()
  })

  it('resolves null when the master key can no longer decrypt', async () => {
    const ls = createFakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const first = await loadAdapter()
    await first.set('k', 'secret-value')

    // Master key lost: fresh IndexedDB + fresh module state generate a new key
    // that cannot decrypt the orphaned ciphertext still in localStorage.
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const second = await loadAdapter()

    await expect(second.get('k')).resolves.toBeNull()
  })

  it('opens IndexedDB only once across multiple operations', async () => {
    const idb = createFakeIndexedDB()
    vi.stubGlobal('localStorage', createFakeLocalStorage())
    vi.stubGlobal('indexedDB', idb)
    const adapter = await loadAdapter()

    await adapter.set('a', '1')
    await adapter.set('b', '2')
    await adapter.get('a')

    expect(idb.getOpenCount()).toBe(1)
  })

  it('adopts an already-persisted master key instead of replacing it', async () => {
    vi.stubGlobal('localStorage', createFakeLocalStorage())
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const first = await loadAdapter()
    await first.set('a', 'written-by-first')

    // Fresh module realm (second tab) sharing the same IndexedDB.
    const second = await loadAdapter()
    await expect(second.get('a')).resolves.toBe('written-by-first')

    await second.set('b', 'written-by-second')
    await expect(first.get('b')).resolves.toBe('written-by-second')
  })

  it('removes a stored value', async () => {
    const ls = createFakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const adapter = await loadAdapter()

    await adapter.set('k', 'secret-value')
    await adapter.remove('k')

    expect(ls.store.has('k')).toBe(false)
    await expect(adapter.get('k')).resolves.toBeNull()
  })

  it('degrades to no-op writes and null reads without indexedDB', async () => {
    const ls = createFakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('indexedDB', undefined)
    const adapter = await loadAdapter()

    await expect(adapter.set('k', 'secret-value')).resolves.toBeUndefined()
    expect(ls.store.size).toBe(0)
    await expect(adapter.get('k')).resolves.toBeNull()
  })

  it('degrades to no-op writes and null reads without localStorage', async () => {
    vi.stubGlobal('localStorage', undefined)
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    const adapter = await loadAdapter()

    await expect(adapter.set('k', 'secret-value')).resolves.toBeUndefined()
    await expect(adapter.get('k')).resolves.toBeNull()
  })

  it('degrades without crypto.subtle', async () => {
    const ls = createFakeLocalStorage()
    vi.stubGlobal('localStorage', ls)
    vi.stubGlobal('indexedDB', createFakeIndexedDB())
    vi.stubGlobal('crypto', {})
    const adapter = await loadAdapter()

    await expect(adapter.set('k', 'secret-value')).resolves.toBeUndefined()
    expect(ls.store.size).toBe(0)
    await expect(adapter.get('k')).resolves.toBeNull()
  })
})
