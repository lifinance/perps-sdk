import { createMemoryStorage } from '@lifi/perps-sdk'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type { OndoApiKey } from '../types/auth.js'
import {
  hasOndoApiKeyScopes,
  isOndoApiKey,
  OndoApiKeyStore,
} from './OndoApiKeyStore.js'

const PRODUCTION_URL = 'https://api.ondoperps.xyz'

const ADDRESS: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

const apiKeyFixture = (overrides?: Partial<OndoApiKey>): OndoApiKey => ({
  keyId: 'key-1',
  apiSecret: 'super-secret',
  name: 'lifi-perps',
  createdAt: '2026-07-14T00:00:00.000Z',
  scopes: ['trade', 'transfer'],
  ...overrides,
})

describe('isOndoApiKey', () => {
  it('accepts a well-formed record', () => {
    expect(isOndoApiKey(apiKeyFixture())).toBe(true)
  })

  it.each([
    ['null', null],
    ['a string', 'key-1'],
    ['an empty keyId', apiKeyFixture({ keyId: '' })],
    ['an empty apiSecret', apiKeyFixture({ apiSecret: '' })],
    ['non-array scopes', { ...apiKeyFixture(), scopes: 'trade' }],
    ['a non-string scope entry', { ...apiKeyFixture(), scopes: ['trade', 1] }],
  ])('rejects %s', (_label, value) => {
    expect(isOndoApiKey(value)).toBe(false)
  })
})

describe('hasOndoApiKeyScopes', () => {
  it.each([
    ['the exact scope set', ['trade', 'transfer'], true],
    ['a superset', ['trade', 'transfer', 'extra'], true],
    ['the scopes in another order', ['transfer', 'trade'], true],
    ['a set without transfer', ['trade'], false],
    ['a set without trade', ['transfer'], false],
    ['an empty set', [], false],
    ['a non-overlapping set', ['read'], false],
  ])('handles %s', (_label, scopes, expected) => {
    expect(hasOndoApiKeyScopes(apiKeyFixture({ scopes }))).toBe(expected)
  })
})

describe('OndoApiKeyStore', () => {
  it('keeps a key without the transfer scope, so the caller can revoke it', async () => {
    const store = new OndoApiKeyStore(createMemoryStorage(), PRODUCTION_URL)
    const tradeOnly = apiKeyFixture({ scopes: ['trade'] })

    await store.set(ADDRESS, tradeOnly)

    await expect(store.get(ADDRESS)).resolves.toEqual(tradeOnly)
  })

  it('evicts a malformed record', async () => {
    const storage = createMemoryStorage()
    const store = new OndoApiKeyStore(storage, PRODUCTION_URL)
    const storageKey = `lifi-perps-ondo-apikey:api.ondoperps.xyz:${ADDRESS.toLowerCase()}`
    await storage.set(storageKey, JSON.stringify({ keyId: 'key-1' }))

    await expect(store.get(ADDRESS)).resolves.toBeNull()
    await expect(storage.get(storageKey)).resolves.toBeNull()
  })
})
