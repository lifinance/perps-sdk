import { createMemoryStorage, type StorageAdapter } from '@lifi/perps-sdk'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultLighterTokenListFetcher,
  defaultLighterTokenRevokeFetcher,
  type LighterApiToken,
  type LighterCreateTokenResponse,
  LighterReadOnlyTokenManager,
  type LighterTokenFetcher,
  type LighterTokenListFetcher,
  type LighterTokenRevokeFetcher,
} from './LighterReadOnlyTokenManager.js'

const ADDRESS_A: Address = '0x1111111111111111111111111111111111111111'
const ADDRESS_B: Address = '0x2222222222222222222222222222222222222222'

/** Representative standard (API-key-signed) Lighter auth token. */
const STD_TOKEN = '1731536000:7:253:abc123'

interface MakeManagerOptions {
  storage?: StorageAdapter
  providerKey?: 'lighter' | 'lighter-rh'
  /** Unix milliseconds. Defaults to a stable mid-2024 anchor for determinism. */
  nowMs?: number
  fetcherResponse?: Partial<LighterCreateTokenResponse>
  /** Override the fetcher with a Vitest-friendly mock for assertion. */
  fetcher?: LighterTokenFetcher
  /** Rows the default list fetcher mock returns. Defaults to an empty registry. */
  registry?: LighterApiToken[]
  listFetcher?: LighterTokenListFetcher
  revokeFetcher?: LighterTokenRevokeFetcher
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
      token_id: 900,
      ...options.fetcherResponse,
    }))
  const listFetcher: LighterTokenListFetcher =
    options.listFetcher ??
    vi.fn(async () => ({ code: 200, api_tokens: options.registry ?? [] }))
  const revokeFetcher: LighterTokenRevokeFetcher =
    options.revokeFetcher ??
    vi.fn(async ({ tokenId }) => ({
      code: 200,
      token_id: tokenId,
      revoked: true,
    }))
  const manager = new LighterReadOnlyTokenManager({
    storage,
    providerKey: options.providerKey,
    fetcher,
    listFetcher,
    revokeFetcher,
    now: () => options.nowMs ?? ANCHOR_NOW_MS,
  })
  return { manager, storage, fetcher, listFetcher, revokeFetcher }
}

const STORAGE_KEY_A7 = `lifi:perps:lighter:rotoken:${ADDRESS_A}:7`

const REST_URL = 'https://mainnet.zklighter.elliot.ai'

const APPROVE_INPUTS = {
  address: ADDRESS_A,
  accountIndex: 7,
  expirySeconds: ANCHOR_NOW_SECONDS + 365 * 86_400,
  scope: 'all' as const,
}

/** A LI.FI-owned, live, unrevoked registry row unless the overrides say otherwise. */
const registryRow = (
  overrides: Partial<LighterApiToken> & Pick<LighterApiToken, 'token_id'>
): LighterApiToken => ({
  api_token: `ro:7:all:${overrides.token_id}`,
  name: 'LI.FI Perps',
  account_index: 7,
  expiry: ANCHOR_NOW_SECONDS + 365 * 86_400,
  sub_account_access: true,
  revoked: false,
  scopes: 'read.*',
  ...overrides,
})

/** Record shape a client persisted while the SDK still discarded `token_id`. */
const OLD_SHAPE_RECORD = {
  token: 'ro:7:all:no-token-id',
  expiry: ANCHOR_NOW_SECONDS + 365 * 86_400,
  scope: 'all',
  accountIndex: 7,
}

const seedStoredToken = async (
  storage: StorageAdapter,
  record: Record<string, unknown>
): Promise<void> => {
  await storage.set(STORAGE_KEY_A7, JSON.stringify(record))
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
        tokenId: 900,
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
          listFetcher: async () => ({ code: 200, api_tokens: [] }),
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

    it('treats a token with a non-numeric expiry as absent (not valid forever)', async () => {
      const storage = createMemoryStorage()
      const key = `lifi:perps:lighter:rotoken:${ADDRESS_A}:7`
      // A corrupt expiry must be treated as absent: NaN comparisons are false,
      // so the token must not pass as valid-forever.
      await storage.set(
        key,
        JSON.stringify({
          token: 'ro:corrupt',
          expiry: 'not-a-number',
          scope: 'all',
          accountIndex: 7,
        })
      )
      const manager = new LighterReadOnlyTokenManager({
        storage,
        now: () => ANCHOR_NOW_MS,
      })

      expect(await manager.get(ADDRESS_A, 7)).toBeUndefined()
      // Poisoned entry evicted so it does not keep tripping later reads.
      expect(await storage.get(key)).toBeNull()
    })

    it('treats unparseable stored JSON as absent', async () => {
      const storage = createMemoryStorage()
      const key = `lifi:perps:lighter:rotoken:${ADDRESS_A}:7`
      await storage.set(key, '{corrupt')
      const manager = new LighterReadOnlyTokenManager({
        storage,
        now: () => ANCHOR_NOW_MS,
      })

      expect(await manager.get(ADDRESS_A, 7)).toBeUndefined()
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

  describe('provider instance namespacing', () => {
    it('persists tokens under per-providerKey keys so instances sharing a storage backend never cross-serve', async () => {
      const storage = createMemoryStorage()
      const mainnet = makeManager({
        storage,
        fetcherResponse: { api_token: 'ro:7:all:mainnet:xx' },
      })
      const rh = makeManager({
        storage,
        providerKey: 'lighter-rh',
        fetcherResponse: { api_token: 'ro:7:all:rh:xx' },
      })

      await mainnet.manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: ANCHOR_NOW_SECONDS + 365 * 86_400,
        scope: 'all',
      })

      expect(await rh.manager.get(ADDRESS_A, 7)).toBeUndefined()
      expect(
        await storage.get(`lifi:perps:lighter:rotoken:${ADDRESS_A}:7`)
      ).not.toBeNull()
      expect(
        await storage.get(`lifi:perps:lighter-rh:rotoken:${ADDRESS_A}:7`)
      ).toBeNull()

      await rh.manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: ANCHOR_NOW_SECONDS + 365 * 86_400,
        scope: 'all',
      })

      // Fresh managers (a page reload) reading the shared persistent layer
      // must resolve each instance's own token.
      const mainnetReloaded = new LighterReadOnlyTokenManager({
        storage,
        now: () => ANCHOR_NOW_MS,
      })
      const rhReloaded = new LighterReadOnlyTokenManager({
        storage,
        providerKey: 'lighter-rh',
        now: () => ANCHOR_NOW_MS,
      })
      expect((await mainnetReloaded.get(ADDRESS_A, 7))?.token).toBe(
        'ro:7:all:mainnet:xx'
      )
      expect((await rhReloaded.get(ADDRESS_A, 7))?.token).toBe('ro:7:all:rh:xx')
    })

    it('stamps the approve() config provider with the instance key', async () => {
      const rh = makeManager({ providerKey: 'lighter-rh' })
      const result = await rh.manager.approve(STD_TOKEN, {
        address: ADDRESS_A,
        accountIndex: 7,
        expirySeconds: ANCHOR_NOW_SECONDS + 365 * 86_400,
        scope: 'all',
      })
      expect(result.config.provider).toBe('lighter-rh')
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

    it('returns false for a token with a non-numeric expiry', async () => {
      const storage = createMemoryStorage()
      await storage.set(
        `lifi:perps:lighter:rotoken:${ADDRESS_A}:7`,
        JSON.stringify({
          token: 'ro:corrupt',
          expiry: 'not-a-number',
          scope: 'all',
          accountIndex: 7,
        })
      )
      const manager = new LighterReadOnlyTokenManager({
        storage,
        now: () => ANCHOR_NOW_MS,
      })
      expect(await manager.isReadOnlyTokenExpiringSoon(ADDRESS_A, 7, 30)).toBe(
        false
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

  describe('stale-token cleanup in approve()', () => {
    it('lists the registry with the account index and the standard auth token', async () => {
      const { manager, listFetcher } = makeManager()

      await manager.approve(STD_TOKEN, APPROVE_INPUTS)

      expect(listFetcher).toHaveBeenCalledWith({
        url: `${REST_URL}/api/v1/tokens`,
        authorization: STD_TOKEN,
        accountIndex: 7,
      })
    })

    it('persists the token_id Lighter assigns to the new row', async () => {
      const { manager, storage } = makeManager({
        fetcherResponse: { token_id: 4321 },
      })

      await manager.approve(STD_TOKEN, APPROVE_INPUTS)

      const stored = JSON.parse((await storage.get(STORAGE_KEY_A7)) as string)
      expect(stored.tokenId).toBe(4321)
    })

    it('revokes nothing when the registry holds no LI.FI rows', async () => {
      const { manager, revokeFetcher } = makeManager({ registry: [] })

      await manager.approve(STD_TOKEN, APPROVE_INPUTS)

      expect(revokeFetcher).not.toHaveBeenCalled()
    })

    it('revokes expired LI.FI rows in token_id order', async () => {
      const { manager, revokeFetcher } = makeManager({
        registry: [
          registryRow({ token_id: 12, expiry: ANCHOR_NOW_SECONDS - 1 }),
          registryRow({ token_id: 11, expiry: ANCHOR_NOW_SECONDS - 60 }),
        ],
      })

      await manager.approve(STD_TOKEN, APPROVE_INPUTS)

      expect(revokeFetcher).toHaveBeenCalledTimes(2)
      expect(revokeFetcher).toHaveBeenNthCalledWith(1, {
        url: `${REST_URL}/api/v1/tokens/revoke`,
        authorization: STD_TOKEN,
        tokenId: 11,
        accountIndex: 7,
      })
      expect(revokeFetcher).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ tokenId: 12 })
      )
    })

    it('never revokes the row the local store currently holds', async () => {
      const storage = createMemoryStorage()
      await seedStoredToken(storage, {
        ...OLD_SHAPE_RECORD,
        token: 'ro:7:all:live',
        tokenId: 42,
      })
      const { manager, revokeFetcher } = makeManager({
        storage,
        registry: [
          registryRow({ token_id: 40 }),
          registryRow({ token_id: 41 }),
          registryRow({ token_id: 42, api_token: 'ro:7:all:live' }),
        ],
      })

      await manager.approve(STD_TOKEN, APPROVE_INPUTS)

      expect(revokeFetcher).toHaveBeenCalledTimes(2)
      expect(revokeFetcher).toHaveBeenCalledWith(
        expect.objectContaining({ tokenId: 40 })
      )
      expect(revokeFetcher).toHaveBeenCalledWith(
        expect.objectContaining({ tokenId: 41 })
      )
      expect(revokeFetcher).not.toHaveBeenCalledWith(
        expect.objectContaining({ tokenId: 42 })
      )
    })

    it('never revokes a row whose name is not the LI.FI token name', async () => {
      const { manager, revokeFetcher } = makeManager({
        registry: [
          registryRow({ token_id: 50, name: 'My own script' }),
          registryRow({ token_id: 51, name: 'Third-party terminal' }),
          registryRow({ token_id: 52, name: '' }),
        ],
      })

      await manager.approve(STD_TOKEN, APPROVE_INPUTS)

      expect(revokeFetcher).not.toHaveBeenCalled()
    })

    it('skips a row Lighter already marked revoked', async () => {
      const { manager, revokeFetcher } = makeManager({
        registry: [
          registryRow({
            token_id: 60,
            revoked: true,
            expiry: ANCHOR_NOW_SECONDS - 60,
          }),
          registryRow({ token_id: 61, expiry: ANCHOR_NOW_SECONDS - 60 }),
        ],
      })

      await manager.approve(STD_TOKEN, APPROVE_INPUTS)

      expect(revokeFetcher).toHaveBeenCalledTimes(1)
      expect(revokeFetcher).toHaveBeenCalledWith(
        expect.objectContaining({ tokenId: 61 })
      )
    })

    it('mints the new token when the list call fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { manager, revokeFetcher } = makeManager({
        listFetcher: vi.fn(async () => {
          throw new Error('tokens list unavailable')
        }),
      })

      const result = await manager.approve(STD_TOKEN, APPROVE_INPUTS)

      expect(result.token.token).toBe('ro:7:all:1731536000:abc')
      expect(revokeFetcher).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('mints the new token and continues the pass when a revoke call fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { manager } = makeManager({
        registry: [
          registryRow({ token_id: 70, expiry: ANCHOR_NOW_SECONDS - 60 }),
          registryRow({ token_id: 71, expiry: ANCHOR_NOW_SECONDS - 60 }),
        ],
        revokeFetcher: vi.fn(async () => {
          throw new Error('revoke rejected')
        }),
      })

      const result = await manager.approve(STD_TOKEN, APPROVE_INPUTS)

      expect(result.token.token).toBe('ro:7:all:1731536000:abc')
      expect(warn).toHaveBeenCalledTimes(2)
    })
  })

  describe('records persisted without a tokenId', () => {
    it('validates an old-shape stored record and returns it instead of re-minting', async () => {
      const storage = createMemoryStorage()
      await seedStoredToken(storage, OLD_SHAPE_RECORD)
      const { manager, fetcher } = makeManager({ storage })

      const found = await manager.get(ADDRESS_A, 7)

      expect(found?.token).toBe('ro:7:all:no-token-id')
      expect(found?.tokenId).toBeUndefined()
      expect(fetcher).not.toHaveBeenCalled()
      // `readValidatedRecord` deletes any record it rejects, so a surviving
      // row is the proof that the validator accepted the old shape.
      expect(await storage.get(STORAGE_KEY_A7)).not.toBeNull()
    })

    it('rejects a stored record whose tokenId is not a finite number', async () => {
      const storage = createMemoryStorage()
      await seedStoredToken(storage, {
        ...OLD_SHAPE_RECORD,
        tokenId: 'not-a-number',
      })
      const { manager } = makeManager({ storage })

      expect(await manager.get(ADDRESS_A, 7)).toBeUndefined()
    })

    it('identifies the live row by its bearer string when the record has no tokenId', async () => {
      const storage = createMemoryStorage()
      await seedStoredToken(storage, OLD_SHAPE_RECORD)
      const { manager, revokeFetcher } = makeManager({
        storage,
        registry: [
          registryRow({ token_id: 80 }),
          registryRow({ token_id: 81, api_token: 'ro:7:all:no-token-id' }),
        ],
      })

      await manager.approve(STD_TOKEN, APPROVE_INPUTS)

      expect(revokeFetcher).toHaveBeenCalledTimes(1)
      expect(revokeFetcher).toHaveBeenCalledWith(
        expect.objectContaining({ tokenId: 80 })
      )
    })
  })

  describe('default list and revoke fetchers', () => {
    it('sends the account index as a query parameter and no body on the list GET', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        async () =>
          new Response(JSON.stringify({ code: 200, api_tokens: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
      )

      const result = await defaultLighterTokenListFetcher({
        url: 'https://lighter.test/api/v1/tokens',
        authorization: STD_TOKEN,
        accountIndex: 7,
      })

      expect(result.api_tokens).toEqual([])
      const call = fetchSpy.mock.calls[0]
      expect(String(call?.[0])).toBe(
        'https://lighter.test/api/v1/tokens?account_index=7'
      )
      expect(call?.[1]?.body).toBeUndefined()
      expect(new Headers(call?.[1]?.headers).get('authorization')).toBe(
        STD_TOKEN
      )
    })

    it('posts the revoke body as application/x-www-form-urlencoded', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(
          async () =>
            new Response(
              JSON.stringify({ code: 200, token_id: 11, revoked: true }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
        )

      const result = await defaultLighterTokenRevokeFetcher({
        url: 'https://lighter.test/api/v1/tokens/revoke',
        authorization: STD_TOKEN,
        tokenId: 11,
        accountIndex: 7,
      })

      expect(result.revoked).toBe(true)
      const init = fetchSpy.mock.calls[0]?.[1]
      expect(init?.method).toBe('POST')
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe(STD_TOKEN)
      expect(headers.get('content-type')).toBe(
        'application/x-www-form-urlencoded'
      )
      expect(init?.body).toBeInstanceOf(URLSearchParams)
      expect(String(init?.body)).toBe('token_id=11&account_index=7')
    })

    it('throws a PerpsError when the list call returns a non-2xx response', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async () => new Response('bad account', { status: 400 })
      )

      await expect(
        defaultLighterTokenListFetcher({
          url: 'https://lighter.test/api/v1/tokens',
          authorization: STD_TOKEN,
          accountIndex: 7,
        })
      ).rejects.toThrow(/Lighter tokens returned 400/)
    })

    it('throws a PerpsError when the revoke call returns a non-2xx response', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async () => new Response('unknown token', { status: 400 })
      )

      await expect(
        defaultLighterTokenRevokeFetcher({
          url: 'https://lighter.test/api/v1/tokens/revoke',
          authorization: STD_TOKEN,
          tokenId: 11,
          accountIndex: 7,
        })
      ).rejects.toThrow(/Lighter tokens\/revoke returned 400/)
    })
  })
})
