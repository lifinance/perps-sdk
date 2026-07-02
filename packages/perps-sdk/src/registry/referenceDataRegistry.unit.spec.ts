import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPerpsClient } from '../client/createPerpsClient.js'
import type { PerpsSDKClient } from '../types/provider.js'
import { ReferenceDataRegistry } from './referenceDataRegistry.js'

type Item = { id: string }

type Deferred = {
  bypass: boolean
  resolve: (items: Item[]) => void
  reject: (error: unknown) => void
  settled: Promise<void>
}

/**
 * Concrete {@link ReferenceDataRegistry} whose fetches never resolve on their
 * own — the test drives resolution order explicitly so load interleavings are
 * deterministic (no real timers).
 */
class TestRegistry extends ReferenceDataRegistry<Item> {
  readonly fetches: Deferred[] = []

  constructor(client: PerpsSDKClient) {
    super(client, 'test', 'thing')
  }

  protected fetchItems(bypassHttpCache: boolean): Promise<Item[]> {
    return new Promise<Item[]>((resolve, reject) => {
      let markSettled!: () => void
      const settled = new Promise<void>((s) => {
        markSettled = s
      })
      this.fetches.push({
        bypass: bypassHttpCache,
        resolve: (items) => {
          resolve(items)
          markSettled()
        },
        reject: (error) => {
          reject(error)
          markSettled()
        },
        settled,
      })
    })
  }

  protected keyOf(item: Item): string {
    return item.id
  }

  list(): readonly Item[] {
    return this.items
  }
}

const freshClient = () =>
  createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })

/** Let the load's `.then`/`.finally` continuations run after a resolve. */
const flush = async () => {
  await new Promise((r) => setTimeout(r, 0))
}

describe('ReferenceDataRegistry', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('never lets a slow stale load overwrite a faster fresh load', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = new TestRegistry(freshClient())

    // Slow load(false) via sync() starts first (stale, will resolve last).
    const slow = registry.sync()
    // A miss triggers the fast load(true) bypass, which starts second.
    expect(registry.get('X')).toBeUndefined()
    expect(registry.fetches).toHaveLength(2)
    expect(registry.fetches[0].bypass).toBe(false)
    expect(registry.fetches[1].bypass).toBe(true)

    // Fresh bypass load resolves first with the newly listed market.
    registry.fetches[1].resolve([{ id: 'X' }])
    await registry.fetches[1].settled
    await flush()
    expect(registry.get('X')).toEqual({ id: 'X' })

    // Stale sync load resolves later with the pre-listing snapshot.
    registry.fetches[0].resolve([])
    await slow
    await flush()

    // The stale snapshot must not have clobbered the fresher index.
    expect(registry.get('X')).toEqual({ id: 'X' })
    expect(registry.list()).toEqual([{ id: 'X' }])
  })

  it('lets a lookup for a not-yet-seen id pierce the cooldown set by an unrelated miss', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = new TestRegistry(freshClient())

    const initial = registry.sync()
    registry.fetches[0].resolve([{ id: 'BTC' }])
    await initial
    await flush()

    // First miss on an unrelated id triggers a bypass refetch and arms the
    // cooldown. The market is still not listed in this snapshot.
    expect(registry.get('junk')).toBeUndefined()
    expect(registry.fetches).toHaveLength(2)
    expect(registry.fetches[1].bypass).toBe(true)
    registry.fetches[1].resolve([{ id: 'BTC' }])
    await registry.fetches[1].settled
    await flush()

    // A different id — now listed upstream — is looked up while the cooldown
    // from the 'junk' miss is still in force. It must still trigger a refetch.
    expect(registry.get('ETH')).toBeUndefined()
    expect(registry.fetches).toHaveLength(3)
    expect(registry.fetches[2].bypass).toBe(true)
    registry.fetches[2].resolve([{ id: 'BTC' }, { id: 'ETH' }])
    await registry.fetches[2].settled
    await flush()

    expect(registry.get('ETH')).toEqual({ id: 'ETH' })
  })

  it('cooldown-gates repeated misses for the same already-refetched id', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = new TestRegistry(freshClient())

    const initial = registry.sync()
    registry.fetches[0].resolve([{ id: 'BTC' }])
    await initial
    await flush()

    expect(registry.get('junk')).toBeUndefined()
    expect(registry.fetches).toHaveLength(2)
    registry.fetches[1].resolve([{ id: 'BTC' }])
    await registry.fetches[1].settled
    await flush()

    // Same id, still unknown, within the cooldown: no further refetch.
    expect(registry.get('junk')).toBeUndefined()
    expect(registry.fetches).toHaveLength(2)
  })

  it('serialises concurrent refetches: misses during an in-flight refetch do not stack', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = new TestRegistry(freshClient())

    const initial = registry.sync()
    registry.fetches[0].resolve([{ id: 'BTC' }])
    await initial
    await flush()

    expect(registry.get('a')).toBeUndefined()
    expect(registry.fetches).toHaveLength(2)
    // Distinct new ids arriving while the first refetch is in flight are
    // covered by it — they must not each start their own refetch.
    expect(registry.get('b')).toBeUndefined()
    expect(registry.get('c')).toBeUndefined()
    expect(registry.fetches).toHaveLength(2)
  })
})
