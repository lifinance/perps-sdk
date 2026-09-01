import type { StorageAdapter } from '@lifi/perps-sdk'
import { createMemoryStorage } from '@lifi/perps-sdk'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { type LighterApiKey, LighterKeyStore } from './LighterKeyStore.js'

const ADDRESS = '0xAbCdEf0000000000000000000000000000000001' as Address
const STORAGE_KEY =
  'lifi-perps-lighter-key:0xabcdef0000000000000000000000000000000001'

const apiKey: Omit<LighterApiKey, 'providerKey'> = {
  accountIndex: 42,
  apiKeyIndex: 1,
  apiKeyPrivateKey: `0x${'11'.repeat(32)}`,
  apiKeyPublicKey: `0x${'22'.repeat(32)}`,
}

/** The record `store.set` writes for the default `lighter` instance. */
const storedApiKey: LighterApiKey = { ...apiKey, providerKey: 'lighter' }

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
      JSON.stringify(storedApiKey)
    )
  })

  it('round-trips a stored key through JSON', async () => {
    const store = new LighterKeyStore(createMemoryStorage())
    await store.set(ADDRESS, apiKey)
    await expect(store.get(ADDRESS)).resolves.toEqual(storedApiKey)
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
    await backing.set(STORAGE_KEY, JSON.stringify(storedApiKey))
    const storage = spyStorage(backing)
    const store = new LighterKeyStore(storage)

    await expect(store.get(ADDRESS)).resolves.toEqual(storedApiKey)
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

  it('treats unparseable stored JSON as absent and evicts it', async () => {
    const backing = createMemoryStorage()
    await backing.set(STORAGE_KEY, '{corrupt')
    const storage = spyStorage(backing)
    const store = new LighterKeyStore(storage)

    await expect(store.get(ADDRESS)).resolves.toBeNull()
    expect(storage.remove).toHaveBeenCalledWith(STORAGE_KEY)
    await expect(backing.get(STORAGE_KEY)).resolves.toBeNull()
  })

  it('treats a partial record missing apiKeyPrivateKey as absent', async () => {
    const backing = createMemoryStorage()
    await backing.set(
      STORAGE_KEY,
      JSON.stringify({
        providerKey: 'lighter',
        accountIndex: 42,
        apiKeyIndex: 1,
        apiKeyPublicKey: apiKey.apiKeyPublicKey,
      })
    )
    const store = new LighterKeyStore(backing)
    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })

  it('treats a record with a non-numeric accountIndex as absent', async () => {
    const backing = createMemoryStorage()
    await backing.set(
      STORAGE_KEY,
      JSON.stringify({ ...storedApiKey, accountIndex: 'oops' })
    )
    const store = new LighterKeyStore(backing)
    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })

  it('normalises mixed-case addresses to the same storage key', async () => {
    const storage = spyStorage(createMemoryStorage())
    const store = new LighterKeyStore(storage)

    await store.set(ADDRESS.toLowerCase() as Address, apiKey)
    await expect(store.get(ADDRESS.toUpperCase() as Address)).resolves.toEqual(
      storedApiKey
    )
  })

  describe('provider-instance scoping', () => {
    const rhKey: Omit<LighterApiKey, 'providerKey'> = {
      ...apiKey,
      apiKeyPrivateKey: `0x${'33'.repeat(32)}`,
    }
    const storedRhKey: LighterApiKey = { ...rhKey, providerKey: 'lighter-rh' }
    const NAMESPACED_KEY =
      'lifi-perps-lighter-key:lighter-rh:0xabcdef0000000000000000000000000000000001'

    it('keeps the legacy un-namespaced key for the default instance', async () => {
      const storage = spyStorage(createMemoryStorage())
      await new LighterKeyStore(storage, 'lighter').set(ADDRESS, apiKey)
      expect(storage.set).toHaveBeenCalledWith(
        STORAGE_KEY,
        JSON.stringify(storedApiKey)
      )
    })

    it('namespaces the storage key for a non-default instance', async () => {
      const storage = spyStorage(createMemoryStorage())
      await new LighterKeyStore(storage, 'lighter-rh').set(ADDRESS, rhKey)
      expect(storage.set).toHaveBeenCalledWith(
        NAMESPACED_KEY,
        JSON.stringify(storedRhKey)
      )
    })

    it('persists instance keys to independent slots over a shared adapter', async () => {
      const shared = createMemoryStorage()

      await new LighterKeyStore(shared, 'lighter').set(ADDRESS, apiKey)
      await new LighterKeyStore(shared, 'lighter-rh').set(ADDRESS, rhKey)

      // Cold reads (fresh stores → empty cache) must each resolve their own key;
      // on the pre-fix code both writes share one slot and the second clobbers the first.
      await expect(
        new LighterKeyStore(shared, 'lighter').get(ADDRESS)
      ).resolves.toEqual(storedApiKey)
      await expect(
        new LighterKeyStore(shared, 'lighter-rh').get(ADDRESS)
      ).resolves.toEqual(storedRhKey)
    })

    it('bindProviderKey overrides the ctor default and re-scopes the storage key', async () => {
      const storage = spyStorage(createMemoryStorage())
      const store = new LighterKeyStore(storage)
      store.bindProviderKey('lighter-rh')

      await store.set(ADDRESS, apiKey)

      expect(storage.set).toHaveBeenCalledWith(
        NAMESPACED_KEY,
        JSON.stringify({ ...apiKey, providerKey: 'lighter-rh' })
      )
    })

    it('stamps the writing instance onto the persisted record', async () => {
      const storage = spyStorage(createMemoryStorage())

      await new LighterKeyStore(storage, 'lighter').set(ADDRESS, apiKey)

      expect(storage.set).toHaveBeenCalledWith(
        STORAGE_KEY,
        JSON.stringify({ ...apiKey, providerKey: 'lighter' })
      )
    })

    it('discards a record another instance wrote into the legacy slot', async () => {
      const backing = createMemoryStorage()
      await backing.set(STORAGE_KEY, JSON.stringify(storedRhKey))
      const storage = spyStorage(backing)

      const store = new LighterKeyStore(storage, 'lighter')

      await expect(store.get(ADDRESS)).resolves.toBeNull()
      expect(storage.remove).toHaveBeenCalledWith(STORAGE_KEY)
      await expect(backing.get(STORAGE_KEY)).resolves.toBeNull()
    })

    it('discards a legacy record that names no instance', async () => {
      const backing = createMemoryStorage()
      await backing.set(STORAGE_KEY, JSON.stringify(apiKey))
      const storage = spyStorage(backing)

      const store = new LighterKeyStore(storage, 'lighter')

      await expect(store.get(ADDRESS)).resolves.toBeNull()
      expect(storage.remove).toHaveBeenCalledWith(STORAGE_KEY)
      await expect(backing.get(STORAGE_KEY)).resolves.toBeNull()
    })

    it('discards a record the default instance wrote into a namespaced slot', async () => {
      const backing = createMemoryStorage()
      await backing.set(NAMESPACED_KEY, JSON.stringify(storedApiKey))

      const store = new LighterKeyStore(backing, 'lighter-rh')

      await expect(store.get(ADDRESS)).resolves.toBeNull()
    })
  })
})
