import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from './storage.js'

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
