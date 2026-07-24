import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Per-provider hash index over one of the provider's reference-data lists
 * (`/markets`, `/assets`), keyed by the list's own primary key.
 *
 * NOT a cache: it holds no freshness policy of its own. Every {@link sync}
 * refetches through the HTTP layer, whose `cache-control` headers decide
 * whether the response comes from disk or the network. A lookup miss warns
 * once per id and returns `undefined`; subsequent syncs reconcile the index
 * without replaying the warning for an id that remains absent.
 *
 * @internal
 */
export abstract class ReferenceDataRegistry<T> {
  private index = new Map<string, T>()
  private current: readonly T[] = []
  private inflight: Promise<readonly T[]> | undefined
  private warnedIds = new Set<string>()

  protected constructor(
    protected readonly client: PerpsSDKClient,
    readonly provider: string,
    private readonly kind: string
  ) {}

  /** Fetch the provider's full list through the HTTP layer. */
  protected abstract fetchItems(): Promise<T[]>

  /** The item's primary key — what {@link get} is keyed by. */
  protected abstract keyOf(item: T): string

  /**
   * Fetch the list through the HTTP cache and rebuild the index. Concurrent
   * callers share one in-flight fetch; a settled fetch is never reused, so
   * HTTP `cache-control` alone governs freshness.
   */
  sync(): Promise<readonly T[]> {
    if (!this.inflight) {
      this.inflight = this.load().finally(() => {
        this.inflight = undefined
      })
    }
    return this.inflight
  }

  /** The most recently synced list. Empty before the first {@link sync}. */
  protected get items(): readonly T[] {
    return this.current
  }

  /** O(1) lookup by primary key. A miss warns once per id. */
  get(id: string): T | undefined {
    const item = this.index.get(id)
    if (item !== undefined) {
      return item
    }
    if (!this.warnedIds.has(id)) {
      this.warnedIds.add(id)
      console.warn(`[${this.provider}] unknown ${this.kind} id '${id}'`)
    }
    return undefined
  }

  private async load(): Promise<readonly T[]> {
    const items = await this.fetchItems()
    this.index = new Map(items.map((item) => [this.keyOf(item), item]))
    this.current = items
    return items
  }
}
