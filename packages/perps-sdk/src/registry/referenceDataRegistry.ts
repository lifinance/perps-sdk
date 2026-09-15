import { PerpsErrorCode } from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'
import type { PerpsSDKClient } from '../types/provider.js'

/** Atomic provider reference indexes; HTTP cache headers govern freshness. @internal */
export abstract class ReferenceDataRegistry<T> {
  private index = new Map<string, T>()
  private secondaryIndexes = new Map<string, Map<string, T>>()
  private current: readonly T[] = []
  private inflight: Promise<readonly T[]> | undefined
  private warnedIds = new Set<string>()

  protected constructor(
    protected readonly client: PerpsSDKClient,
    readonly provider: string,
    private readonly kind: string,
    private readonly secondaryKeys: Readonly<
      Record<string, (item: T) => string | undefined>
    > = {}
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

  protected getByIndex(id: string, key: string): T | undefined {
    return this.secondaryIndexes.get(key)?.get(id)
  }

  private async load(): Promise<readonly T[]> {
    const items = await this.fetchItems()
    const index = new Map<string, T>()
    for (const item of items) {
      const key = this.keyOf(item)
      if (index.has(key)) {
        throw new PerpsError(
          PerpsErrorCode.ValidationError,
          `[${this.provider}] stale or mis-keyed ${this.kind} registry: duplicate id '${key}'`
        )
      }
      index.set(key, item)
    }
    const secondaryIndexes = new Map<string, Map<string, T>>()
    for (const [name, keyOf] of Object.entries(this.secondaryKeys)) {
      const secondary = new Map<string, T>()
      for (const item of items) {
        const key = keyOf(item)
        if (key === undefined) {
          continue
        }
        if (secondary.has(key)) {
          throw new PerpsError(
            PerpsErrorCode.ValidationError,
            `[${this.provider}] stale or mis-keyed ${this.kind} registry: duplicate ${name} '${key}'`
          )
        }
        secondary.set(key, item)
      }
      secondaryIndexes.set(name, secondary)
    }
    this.index = index
    this.secondaryIndexes = secondaryIndexes
    this.current = items
    return items
  }
}
