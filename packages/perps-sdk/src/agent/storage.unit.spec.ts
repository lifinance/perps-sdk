import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStorage, localStorageAdapter } from './storage.js'

describe('createMemoryStorage', () => {
  it('returns null for a key that was never set', async () => {
    const store = createMemoryStorage()
    await expect(store.get('missing')).resolves.toBeNull()
  })

  it('round-trips a stored value', async () => {
    const store = createMemoryStorage()
    await store.set('k', 'v')
    await expect(store.get('k')).resolves.toBe('v')
  })

  it('overwrites an existing value', async () => {
    const store = createMemoryStorage()
    await store.set('k', 'first')
    await store.set('k', 'second')
    await expect(store.get('k')).resolves.toBe('second')
  })

  it('removes a value, after which get returns null', async () => {
    const store = createMemoryStorage()
    await store.set('k', 'v')
    await store.remove('k')
    await expect(store.get('k')).resolves.toBeNull()
  })

  it('remove on an absent key is a no-op', async () => {
    const store = createMemoryStorage()
    await expect(store.remove('absent')).resolves.toBeUndefined()
  })

  it('isolates state between independent instances', async () => {
    const a = createMemoryStorage()
    const b = createMemoryStorage()
    await a.set('k', 'a-value')
    await expect(b.get('k')).resolves.toBeNull()
  })
})

describe('localStorageAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The node test environment has no `localStorage`; the adapter must swallow
  // the resulting ReferenceError and degrade gracefully (SSR safety).
  it('returns null from get when localStorage is unavailable', async () => {
    await expect(localStorageAdapter.get('k')).resolves.toBeNull()
  })

  it('set is a silent no-op when localStorage is unavailable', async () => {
    await expect(localStorageAdapter.set('k', 'v')).resolves.toBeUndefined()
  })

  it('remove is a silent no-op when localStorage is unavailable', async () => {
    await expect(localStorageAdapter.remove('k')).resolves.toBeUndefined()
  })

  it('delegates to the global localStorage when present', async () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => backing.set(key, value),
      removeItem: (key: string) => backing.delete(key),
    })

    await localStorageAdapter.set('lifi-perps-agent:0xabc:hyperliquid', 'token')
    await expect(
      localStorageAdapter.get('lifi-perps-agent:0xabc:hyperliquid')
    ).resolves.toBe('token')

    await localStorageAdapter.remove('lifi-perps-agent:0xabc:hyperliquid')
    await expect(
      localStorageAdapter.get('lifi-perps-agent:0xabc:hyperliquid')
    ).resolves.toBeNull()
  })

  it('returns null from get when localStorage.getItem throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {},
      removeItem: () => {},
    })

    await expect(localStorageAdapter.get('k')).resolves.toBeNull()
  })
})
