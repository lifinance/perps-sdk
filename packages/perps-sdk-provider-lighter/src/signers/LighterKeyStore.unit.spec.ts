import type { StorageAdapter } from '@lifi/perps-sdk'
import { createMemoryStorage } from '@lifi/perps-sdk'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { type LighterApiKey, LighterKeyStore } from './LighterKeyStore.js'

const ADDRESS = '0xAbCdEf0000000000000000000000000000000001' as Address
const STORAGE_KEY =
  'lifi-perps-lighter-key:0xabcdef0000000000000000000000000000000001'

const apiKey: LighterApiKey = {
  accountIndex: 42,
  apiKeyIndex: 1,
  apiKeyPrivateKey: `0x${'11'.repeat(32)}`,
  apiKeyPublicKey: `0x${'22'.repeat(32)}`,
}

const spyStorage = (inner: StorageAdapter) => ({
  get: vi.fn(inner.get),
  set: vi.fn(inner.set),
  remove: vi.fn(inner.remove),
})

describe('LighterKeyStore', () => {
  it('returns null when no key is stored', async () => {
    const store = new LighterKeyStore(createMemoryStorage())
    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })

  it('persists under a provider-namespaced, lowercased storage key', async () => {
    const storage = spyStorage(createMemoryStorage())
    const store = new LighterKeyStore(storage)

    await store.set(ADDRESS, apiKey)

    expect(storage.set).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(apiKey)
    )
  })

  it('round-trips a stored key through JSON', async () => {
    const store = new LighterKeyStore(createMemoryStorage())
    await store.set(ADDRESS, apiKey)
    await expect(store.get(ADDRESS)).resolves.toEqual(apiKey)
  })

  it('serves a freshly-set key from cache without re-reading storage', async () => {
    const storage = spyStorage(createMemoryStorage())
    const store = new LighterKeyStore(storage)

    await store.set(ADDRESS, apiKey)
    await store.get(ADDRESS)

    // set warms the cache, so get never touches storage.get
    expect(storage.get).not.toHaveBeenCalled()
  })

  it('reads from storage on a cache miss, then caches for subsequent gets', async () => {
    const backing = createMemoryStorage()
    await backing.set(STORAGE_KEY, JSON.stringify(apiKey))
    const storage = spyStorage(backing)
    const store = new LighterKeyStore(storage)

    await expect(store.get(ADDRESS)).resolves.toEqual(apiKey)
    await store.get(ADDRESS)

    // Only the first (cache-miss) get hits storage.
    expect(storage.get).toHaveBeenCalledTimes(1)
  })

  it('remove clears both the cache and the backing storage', async () => {
    const storage = spyStorage(createMemoryStorage())
    const store = new LighterKeyStore(storage)
    await store.set(ADDRESS, apiKey)

    await store.remove(ADDRESS)

    expect(storage.remove).toHaveBeenCalledWith(STORAGE_KEY)
    // A subsequent get is a cache miss → storage.get is consulted and yields null.
    await expect(store.get(ADDRESS)).resolves.toBeNull()
    expect(storage.get).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('normalises mixed-case addresses to the same storage key', async () => {
    const storage = spyStorage(createMemoryStorage())
    const store = new LighterKeyStore(storage)

    await store.set(ADDRESS.toLowerCase() as Address, apiKey)
    await expect(store.get(ADDRESS.toUpperCase() as Address)).resolves.toEqual(
      apiKey
    )
  })
})
