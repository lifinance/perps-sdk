import { createMemoryStorage, type StorageAdapter } from '@lifi/perps-sdk'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type LighterCreateTokenResponse,
  LighterReadOnlyTokenManager,
  type LighterTokenFetcher,
} from './LighterReadOnlyTokenManager.js'

const ADDRESS_A: Address = '0x1111111111111111111111111111111111111111'
const ADDRESS_B: Address = '0x2222222222222222222222222222222222222222'

/** Representative standard (API-key-signed) Lighter auth token. */
const STD_TOKEN = '1731536000:7:253:abc123'

interface MakeManagerOptions {
  storage?: StorageAdapter
  /** Unix milliseconds. Defaults to a stable mid-2024 anchor for determinism. */
  nowMs?: number
  fetcherResponse?: Partial<LighterCreateTokenResponse>
  /** Override the fetcher with a Vitest-friendly mock for assertion. */
  fetcher?: LighterTokenFetcher
}

const ANCHOR_NOW_MS = 1_700_000_000 * 1000
const ANCHOR_NOW_SECONDS = 1_700_000_000

function makeManager(options: MakeManagerOptions = {}) {
  const storage = options.storage ?? createMemoryStorage()
  const fetcher: LighterTokenFetcher =
    options.fetcher ??
    vi.fn(async () => ({
      api_token: 'ro:7:all:1731536000:abc',
      account_index: 7,
      expiry: ANCHOR_NOW_SECONDS + 365 * 86_400,
      scopes: 'all',
      ...options.fetcherResponse,
    }))
  const manager = new LighterReadOnlyTokenManager({
    storage,
    fetcher,
    now: () => options.nowMs ?? ANCHOR_NOW_MS,
  })
  return { manager, storage, fetcher: fetcher as ReturnType<typeof vi.fn> }
}

describe('LighterReadOnlyTokenManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('approve()', () => {
    it('authenticates tokens/create with the standard auth token and persists the token', async () => {
      const { manager, storage, fetcher } = makeManager()

      const result = await manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: ANCHOR_NOW_SECONDS + 365 * 86_400,
        scope: 'all',
      })

      expect(fetcher).toHaveBeenCalledWith({
        url: 'https://mainnet.zklighter.elliot.ai/api/v1/tokens/create',
        authorization: STD_TOKEN,
        name: 'LI.FI Perps',
        accountIndex: 7,
        expiry: ANCHOR_NOW_SECONDS + 365 * 86_400,
        subAccountAccess: true,
        scopes: 'read.*',
      })
      expect(result.token.token).toBe('ro:7:all:1731536000:abc')
      expect(result.config).toEqual({
        provider: 'lighter',
        accountIndex: 7,
        readOnlyTokenApproved: true,
        readOnlyTokenExpiry: ANCHOR_NOW_SECONDS + 365 * 86_400,
        readOnlyTokenScope: 'all',
      })

      const stored = await storage.get(
        `lifi:perps:lighter:rotoken:${ADDRESS_A}:7`
      )
      expect(stored).not.toBeNull()
      expect(JSON.parse(stored as string)).toEqual({
        token: 'ro:7:all:1731536000:abc',
        expiry: ANCHOR_NOW_SECONDS + 365 * 86_400,
        scope: 'all',
        accountIndex: 7,
      })
    })

    it('keys the stored token by the requested accountIndex, not a divergent echoed account_index', async () => {
      const { manager, storage } = makeManager({
        fetcherResponse: {
          api_token: 'ro:echo-mismatch',
          account_index: 999,
          expiry: ANCHOR_NOW_SECONDS + 365 * 86_400,
        },
      })

      await manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: ANCHOR_NOW_SECONDS + 365 * 86_400,
        scope: 'all',
      })

      // Retrievable under the index we queried with, never the echoed 999 — a
      // mismatch here orphans the token and re-creates a 10-year token every read.
      const found = await manager.get(ADDRESS_A, 7)
      expect(found?.token).toBe('ro:echo-mismatch')
      expect(found?.accountIndex).toBe(7)
      expect(await manager.get(ADDRESS_A, 999)).toBeUndefined()
      expect(
        await storage.get(`lifi:perps:lighter:rotoken:${ADDRESS_A}:7`)
      ).not.toBeNull()
    })

    it("treats scope 'single' as sub_account_access=false on the wire", async () => {
      const { manager, fetcher } = makeManager({
        fetcherResponse: { scopes: 'single' },
      })

      await manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 3,
        expirySeconds: ANCHOR_NOW_SECONDS + 30 * 86_400,
        scope: 'single',
      })

      expect(fetcher).toHaveBeenCalledWith(
        expect.objectContaining({
          accountIndex: 3,
          scopes: 'read.*',
          subAccountAccess: false,
        })
      )
    })

    it('overwrites a prior stored token on renewal (same key)', async () => {
      const storage = createMemoryStorage()
      const earlyExpiry = ANCHOR_NOW_SECONDS + 7 * 86_400
      const lateExpiry = ANCHOR_NOW_SECONDS + 365 * 86_400

      const first = makeManager({
        storage,
        fetcherResponse: {
          api_token: 'ro:7:all:first:xx',
          expiry: earlyExpiry,
        },
      })
      await first.manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: earlyExpiry,
        scope: 'all',
      })

      const second = makeManager({
        storage,
        fetcherResponse: {
          api_token: 'ro:7:all:second:yy',
          expiry: lateExpiry,
        },
      })
      await second.manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: lateExpiry,
        scope: 'all',
      })

      const fresh = await second.manager.get(ADDRESS_A, 7)
      expect(fresh?.token).toBe('ro:7:all:second:yy')
      expect(fresh?.expiry).toBe(lateExpiry)
    })

    it('throws a PerpsError when the default fetcher receives a non-2xx response', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn(
        async () => new Response('bad scope', { status: 400 })
      ) as typeof fetch
      try {
        const manager = new LighterReadOnlyTokenManager({
          storage: createMemoryStorage(),
          now: () => ANCHOR_NOW_MS,
        })
        await expect(
          manager.approve(STD_TOKEN, {
            address: ADDRESS_A,
            accountIndex: 1,
            expirySeconds: ANCHOR_NOW_SECONDS + 86_400,
            scope: 'all',
          })
        ).rejects.toThrow(/Lighter tokens\/create returned 400/)
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('get()', () => {
    it('returns the stored token when not expired', async () => {
      const { manager } = makeManager()
      await manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: ANCHOR_NOW_SECONDS + 365 * 86_400,
        scope: 'all',
      })

      const found = await manager.get(ADDRESS_A, 7)
      expect(found?.token).toBe('ro:7:all:1731536000:abc')
    })

    it('returns undefined when the stored token is past its expiry', async () => {
      const storage = createMemoryStorage()
      const expired = makeManager({
        storage,
        nowMs: ANCHOR_NOW_MS,
        fetcherResponse: {
          api_token: 'ro:7:all:expired:xx',
          expiry: ANCHOR_NOW_SECONDS + 60,
        },
      })
      await expired.manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: ANCHOR_NOW_SECONDS + 60,
        scope: 'all',
      })

      // Cache-clear: a second manager with a clock past expiry reads from
      // storage and rejects.
      const advanced = new LighterReadOnlyTokenManager({
        storage,
        now: () => (ANCHOR_NOW_SECONDS + 120) * 1000,
      })
      const fresh = await advanced.get(ADDRESS_A, 7)
      expect(fresh).toBeUndefined()
    })

    it('keeps separate entries per accountIndex under the same L1 address', async () => {
      const storage = createMemoryStorage()
      const a = makeManager({
        storage,
        fetcherResponse: {
          api_token: 'ro:1:all:1731536000:aaa',
          account_index: 1,
          expiry: ANCHOR_NOW_SECONDS + 86_400,
        },
      })
      await a.manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 1,
        expirySeconds: ANCHOR_NOW_SECONDS + 86_400,
        scope: 'all',
      })

      const b = makeManager({
        storage,
        fetcherResponse: {
          api_token: 'ro:2:all:1731536000:bbb',
          account_index: 2,
          expiry: ANCHOR_NOW_SECONDS + 86_400,
        },
      })
      await b.manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 2,
        expirySeconds: ANCHOR_NOW_SECONDS + 86_400,
        scope: 'all',
      })

      // Both stored independently.
      const account1 = await b.manager.get(ADDRESS_A, 1)
      const account2 = await b.manager.get(ADDRESS_A, 2)
      expect(account1?.token).toBe('ro:1:all:1731536000:aaa')
      expect(account2?.token).toBe('ro:2:all:1731536000:bbb')
    })

    it('keeps separate entries per L1 address for the same accountIndex', async () => {
      const storage = createMemoryStorage()
      const aSetup = makeManager({
        storage,
        fetcherResponse: {
          api_token: 'ro:7:all:a:zz',
          expiry: ANCHOR_NOW_SECONDS + 86_400,
        },
      })
      await aSetup.manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: ANCHOR_NOW_SECONDS + 86_400,
        scope: 'all',
      })
      const bSetup = makeManager({
        storage,
        fetcherResponse: {
          api_token: 'ro:7:all:b:zz',
          expiry: ANCHOR_NOW_SECONDS + 86_400,
        },
      })
      await bSetup.manager.approve(STD_TOKEN, {
        address: ADDRESS_B,
        accountIndex: 7,
        expirySeconds: ANCHOR_NOW_SECONDS + 86_400,
        scope: 'all',
      })

      const a = await bSetup.manager.get(ADDRESS_A, 7)
      const b = await bSetup.manager.get(ADDRESS_B, 7)
      expect(a?.token).toBe('ro:7:all:a:zz')
      expect(b?.token).toBe('ro:7:all:b:zz')
    })
  })

  describe('isReadOnlyTokenExpiringSoon()', () => {
    it('returns false when no token is stored', async () => {
      const { manager } = makeManager()
      expect(await manager.isReadOnlyTokenExpiringSoon(ADDRESS_A, 7)).toBe(
        false
      )
    })

    it('returns false when the token has more than thresholdDays of life', async () => {
      const { manager } = makeManager({
        fetcherResponse: {
          expiry: ANCHOR_NOW_SECONDS + 365 * 86_400,
        },
      })
      await manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: ANCHOR_NOW_SECONDS + 365 * 86_400,
        scope: 'all',
      })
      expect(await manager.isReadOnlyTokenExpiringSoon(ADDRESS_A, 7, 30)).toBe(
        false
      )
    })

    it('returns true when the token is within thresholdDays of expiry', async () => {
      const { manager } = makeManager({
        fetcherResponse: {
          expiry: ANCHOR_NOW_SECONDS + 10 * 86_400,
        },
      })
      await manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: ANCHOR_NOW_SECONDS + 10 * 86_400,
        scope: 'all',
      })
      expect(await manager.isReadOnlyTokenExpiringSoon(ADDRESS_A, 7, 30)).toBe(
        true
      )
    })

    it('returns false once the token has already expired (caller treats as no token)', async () => {
      const storage = createMemoryStorage()
      const setup = makeManager({
        storage,
        fetcherResponse: {
          expiry: ANCHOR_NOW_SECONDS + 60,
        },
      })
      await setup.manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: ANCHOR_NOW_SECONDS + 60,
        scope: 'all',
      })

      const advanced = new LighterReadOnlyTokenManager({
        storage,
        now: () => (ANCHOR_NOW_SECONDS + 120) * 1000,
      })
      expect(await advanced.isReadOnlyTokenExpiringSoon(ADDRESS_A, 7, 30)).toBe(
        false
      )
    })
  })

  describe('remove()', () => {
    it('clears both cache and storage', async () => {
      const { manager, storage } = makeManager()
      await manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: ANCHOR_NOW_SECONDS + 86_400,
        scope: 'all',
      })
      expect(await manager.get(ADDRESS_A, 7)).toBeDefined()

      await manager.remove(ADDRESS_A, 7)
      expect(await manager.get(ADDRESS_A, 7)).toBeUndefined()
      expect(
        await storage.get(`lifi:perps:lighter:rotoken:${ADDRESS_A}:7`)
      ).toBeNull()
    })
  })
})
