import { PerpsErrorCode } from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'
import type { RequestOptions } from '../transport/request.js'
import type { PerpsSDKClient } from '../types/provider.js'
import { createWarnOnce } from '../utils/warnOnce.js'

function freshUntil(
  headers: Headers,
  requestStartedAt: number,
  responseReceivedAt: number
): number {
  const directives = (headers.get('cache-control') ?? '')
    .toLowerCase()
    .split(',')
    .map((directive) => directive.trim())
  if (
    directives.some((directive) =>
      /^(no-store|no-cache)(?:\s*=|$)/.test(directive)
    ) ||
    headers
      .get('vary')
      ?.split(',')
      .some((name) => name.trim() === '*')
  ) {
    return 0
  }
  const maxAges = directives.filter((directive) =>
    /^max-age(?:\s*=|$)/.test(directive)
  )
  const maxAge =
    maxAges.length === 1
      ? /^max-age\s*=\s*(?:"(\d+)"|(\d+))$/.exec(maxAges[0])
      : null
  if (!maxAge) {
    return 0
  }
  const age = headers.get('age') ?? '0'
  const date = headers.get('date')
  const dateTime = date === null ? responseReceivedAt : Date.parse(date)
  if (!/^\d+$/.test(age) || !Number.isFinite(dateTime)) {
    return 0
  }
  const lifetime = Number(maxAge[1] ?? maxAge[2]) * 1000
  const currentAge = Math.max(
    responseReceivedAt - dateTime,
    Number(age) * 1000 + Math.max(0, responseReceivedAt - requestStartedAt)
  )
  return Number.isFinite(lifetime)
    ? responseReceivedAt + lifetime - currentAge
    : 0
}

/** Atomic provider reference indexes; HTTP cache headers govern freshness. @internal */
export abstract class ReferenceDataRegistry<T> {
  private index = new Map<string, T>()
  private secondaryIndexes = new Map<string, Map<string, T>>()
  private current: readonly T[] = []
  private inflight: Promise<readonly T[]> | undefined
  private inflightIdentity: string | undefined
  private cacheIdentity: string | undefined
  private freshUntil = 0
  private readonly warnOnce = createWarnOnce()

  protected constructor(
    protected readonly client: PerpsSDKClient,
    readonly provider: string,
    private readonly kind: string,
    private readonly secondaryKeys: Readonly<
      Record<string, (item: T) => string | undefined>
    > = {}
  ) {}

  /** Fetch the provider's full list through the HTTP layer. */
  protected abstract fetchItems(
    onResponse: RequestOptions['onResponse']
  ): Promise<T[]>

  /** The item's primary key — what {@link get} is keyed by. */
  protected abstract keyOf(item: T): string

  /** Sync reference indexes, reusing only explicitly fresh Node responses. */
  sync(): Promise<readonly T[]> {
    const { config } = this.client
    // Hooks can change credentials or cache policy on every call.
    if (config.requestInterceptor || config.fetch) {
      return this.load()
    }
    const identity = JSON.stringify([
      config.apiUrl,
      config.apiKey,
      config.integrator,
    ])
    if (identity === this.cacheIdentity && Date.now() < this.freshUntil) {
      return Promise.resolve(this.current)
    }
    if (!this.inflight || this.inflightIdentity !== identity) {
      const inflight = this.load(identity).finally(() => {
        if (this.inflight === inflight) {
          this.inflight = undefined
          this.inflightIdentity = undefined
        }
      })
      this.inflight = inflight
      this.inflightIdentity = identity
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
    this.warnOnce(id, `[${this.provider}] unknown ${this.kind} id '${id}'`)
    return undefined
  }

  protected getByIndex(id: string, key: string): T | undefined {
    return this.secondaryIndexes.get(key)?.get(id)
  }

  private async load(identity?: string): Promise<readonly T[]> {
    let expiresAt = 0
    const items = await this.fetchItems((headers, startedAt, receivedAt) => {
      // Browsers retain their native HTTP cache and its resident response age.
      if (
        identity !== undefined &&
        typeof process !== 'undefined' &&
        process.versions?.node
      ) {
        expiresAt = freshUntil(headers, startedAt, receivedAt)
      }
    })
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
    this.cacheIdentity = identity
    this.freshUntil = expiresAt
    return items
  }
}
