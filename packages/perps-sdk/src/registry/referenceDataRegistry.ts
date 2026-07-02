import type { PerpsSDKClient } from '../types/provider.js'

/** Minimum gap between unknown-id-triggered, HTTP-cache-bypassing refetches. */
const REFRESH_COOLDOWN_MS = 60_000

/**
 * Per-provider hash index over one of the provider's reference-data lists
 * (`/markets`, `/assets`), keyed by the list's own primary key.
 *
 * NOT a cache: it holds no freshness policy of its own. Every {@link sync}
 * refetches through the HTTP layer, whose `cache-control` headers decide
 * whether the response comes from disk or the network. A lookup miss
 * schedules a background refetch that bypasses the HTTP cache — the id may
 * have listed after the cached snapshot.
 *
 * Refetch policy: an id not yet refetched-for triggers one immediate bypass
 * refetch so a just-listed id resolves promptly; repeated misses for an
 * already-refetched id are gated by {@link REFRESH_COOLDOWN_MS} (measured from
 * the previous refetch's completion), and only one bypass refetch runs at a
 * time. Concurrent loads install in generation order — a slower fetch that
 * started earlier can never overwrite the index a later fetch already installed.
 *
 * @internal
 */
export abstract class ReferenceDataRegistry<T> {
  private index = new Map<string, T>()
  private current: readonly T[] = []
  private inflight: Promise<readonly T[]> | undefined
  private warnedIds = new Set<string>()
  private refetchedIds = new Set<string>()
  private generation = 0
  private refreshInflight = false
  private refreshAfter = 0

  protected constructor(
    protected readonly client: PerpsSDKClient,
    readonly provider: string,
    private readonly kind: string
  ) {}

  /** Fetch the provider's full list, bypassing the HTTP cache when asked. */
  protected abstract fetchItems(bypassHttpCache: boolean): Promise<T[]>

  /** The item's primary key — what {@link get} is keyed by. */
  protected abstract keyOf(item: T): string

  /**
   * Fetch the list through the HTTP cache and rebuild the index. Concurrent
   * callers share one in-flight fetch; a settled fetch is never reused, so
   * HTTP `cache-control` alone governs freshness.
   */
  sync(): Promise<readonly T[]> {
    if (!this.inflight) {
      this.inflight = this.load(false).finally(() => {
        this.inflight = undefined
      })
    }
    return this.inflight
  }

  /** The most recently synced list. Empty before the first {@link sync}. */
  protected get items(): readonly T[] {
    return this.current
  }

  /**
   * O(1) lookup by primary key. A miss warns once per id and schedules a
   * cache-bypassing background refetch per the class's refetch policy.
   */
  get(id: string): T | undefined {
    const item = this.index.get(id)
    if (item !== undefined) {
      return item
    }
    if (!this.warnedIds.has(id)) {
      this.warnedIds.add(id)
      console.warn(`[${this.provider}] unknown ${this.kind} id '${id}'`)
    }
    this.scheduleRefresh(id)
    return undefined
  }

  private async load(bypassHttpCache: boolean): Promise<readonly T[]> {
    const generation = ++this.generation
    const items = await this.fetchItems(bypassHttpCache)
    // Install only if no later load has started since this fetch began, so a
    // slow stale response can never replace a fresher index.
    if (generation === this.generation) {
      this.index = new Map(items.map((item) => [this.keyOf(item), item]))
      this.current = items
      this.warnedIds.clear()
    }
    return items
  }

  private scheduleRefresh(id: string): void {
    // One bypass refetch reloads the whole list, covering every pending
    // unknown id, so never run two at once.
    if (this.refreshInflight) {
      this.refetchedIds.add(id)
      return
    }
    // A not-yet-refetched id gets one immediate refetch even inside the
    // cooldown, so a just-listed id isn't withheld by an unrelated miss;
    // repeated misses for the same id stay cooldown-gated.
    if (this.refetchedIds.has(id) && Date.now() < this.refreshAfter) {
      return
    }
    this.refreshInflight = true
    this.refetchedIds.add(id)
    this.load(true)
      .catch((error) =>
        console.error(
          `[${this.provider}] ${this.kind} registry refresh failed`,
          error
        )
      )
      .finally(() => {
        this.refreshInflight = false
        this.refreshAfter = Date.now() + REFRESH_COOLDOWN_MS
      })
  }
}
