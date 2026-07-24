import { createMemoryStorage } from '@lifi/perps-sdk'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type { OndoAuthToken } from '../types/auth.js'
import { OndoTokenStore } from './OndoTokenStore.js'

const PRODUCTION_URL = 'https://api.ondoperps.xyz'
const SANDBOX_URL = 'https://api.ondoperps-sandbox.xyz'

const ADDRESS: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const OTHER_ADDRESS: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

const nowSecs = () => Math.floor(Date.now() / 1000)

const tokenFixture = (overrides?: Partial<OndoAuthToken>): OndoAuthToken => ({
  identifier: ADDRESS.toLowerCase(),
  authType: 'erc4361',
  accountId: 'acct-1',
  issuedAtSecs: nowSecs() - 60,
  expirationSecs: nowSecs() + 3600,
  token: 'ondo-jwt-token',
  ...overrides,
})

describe('OndoTokenStore', () => {
  it('round-trips a session token through the storage adapter', async () => {
    const store = new OndoTokenStore(createMemoryStorage(), PRODUCTION_URL)
    const token = tokenFixture()

    await store.set(ADDRESS, token)

    await expect(store.get(ADDRESS)).resolves.toEqual(token)
  })

  it('returns null when no token was stored', async () => {
    const store = new OndoTokenStore(createMemoryStorage(), PRODUCTION_URL)

    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })

  it('namespaces tokens per wallet address', async () => {
    const store = new OndoTokenStore(createMemoryStorage(), PRODUCTION_URL)
    await store.set(ADDRESS, tokenFixture())

    await expect(store.get(OTHER_ADDRESS)).resolves.toBeNull()
  })

  it('namespaces tokens per environment host', async () => {
    const storage = createMemoryStorage()
    const production = new OndoTokenStore(storage, PRODUCTION_URL)
    const sandbox = new OndoTokenStore(storage, SANDBOX_URL)

    await production.set(ADDRESS, tokenFixture())

    await expect(sandbox.get(ADDRESS)).resolves.toBeNull()
    await expect(production.get(ADDRESS)).resolves.not.toBeNull()
  })

  it('treats the address case-insensitively', async () => {
    const store = new OndoTokenStore(createMemoryStorage(), PRODUCTION_URL)
    const token = tokenFixture()

    await store.set(ADDRESS, token)

    await expect(store.get(ADDRESS.toLowerCase() as Address)).resolves.toEqual(
      token
    )
  })

  it('reads an expired token as absent and evicts it from storage', async () => {
    const storage = createMemoryStorage()
    const store = new OndoTokenStore(storage, PRODUCTION_URL)
    await store.set(ADDRESS, tokenFixture({ expirationSecs: nowSecs() - 1 }))

    await expect(store.get(ADDRESS)).resolves.toBeNull()

    const remaining = await Promise.all(
      [ADDRESS, ADDRESS.toLowerCase() as Address].map(async (address) =>
        storage.get(
          `lifi-perps-ondo-session:api.ondoperps.xyz:${address.toLowerCase()}`
        )
      )
    )
    expect(remaining.every((value) => value === null)).toBe(true)
  })

  it('reads a token that expires between set and get as absent', async () => {
    const store = new OndoTokenStore(createMemoryStorage(), PRODUCTION_URL)
    await store.set(ADDRESS, tokenFixture({ expirationSecs: nowSecs() - 1 }))
    // The setter primes an in-memory cache; expiry must be enforced on the
    // cached read path too, not only on the storage read path.
    await expect(store.get(ADDRESS)).resolves.toBeNull()
    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })

  it('reads a malformed stored record as absent', async () => {
    const storage = createMemoryStorage()
    await storage.set(
      `lifi-perps-ondo-session:api.ondoperps.xyz:${ADDRESS.toLowerCase()}`,
      '{"token":"missing-everything-else"'
    )
    const store = new OndoTokenStore(storage, PRODUCTION_URL)

    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })

  it('removes a stored token', async () => {
    const store = new OndoTokenStore(createMemoryStorage(), PRODUCTION_URL)
    await store.set(ADDRESS, tokenFixture())

    await store.remove(ADDRESS)

    await expect(store.get(ADDRESS)).resolves.toBeNull()
  })
})
