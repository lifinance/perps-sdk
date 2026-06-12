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
 * schedules a cooldown-gated background refetch that bypasses the HTTP
 * cache — the id may have listed after the cached snapshot.
 *
 * @internal
 */
export abstract class ReferenceDataRegistry<T> {
  private index = new Map<string, T>()
  private current: readonly T[] = []
  private inflight: Promise<readonly T[]> | undefined
  private warnedIds = new Set<string>()
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
   * O(1) lookup by primary key. A miss warns once per id and schedules the
   * cooldown-gated, cache-bypassing background refetch.
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
    this.scheduleRefresh()
    return undefined
  }

  private async load(bypassHttpCache: boolean): Promise<readonly T[]> {
    const items = await this.fetchItems(bypassHttpCache)
    this.index = new Map(items.map((item) => [this.keyOf(item), item]))
    this.current = items
    this.warnedIds.clear()
    return items
  }

  private scheduleRefresh(): void {
    const now = Date.now()
    if (now < this.refreshAfter) {
      return
    }
    // Set before any await so concurrent misses cannot trigger a refetch storm.
    this.refreshAfter = now + REFRESH_COOLDOWN_MS
    this.load(true).catch((error) =>
      console.error(
        `[${this.provider}] ${this.kind} registry refresh failed`,
        error
      )
    )
  }
}
