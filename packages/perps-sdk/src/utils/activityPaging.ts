import type { ActivityItem, Pagination } from '@lifi/perps-types'
import type { ProviderGetActivityParams } from '../types/provider.js'

/**
 * Merge a provider's freshly-fetched activity rows with the replayed
 * overflow tail from the previous page, apply the request's type and time
 * filters, sort newest-first, and slice to the page limit.
 *
 * `mintCursor` receives the rows past the slice (the new overflow tail) and
 * returns the provider's own encoded cursor, or `undefined` when no overflow
 * rows remain and all of the provider's per-endpoint cursors are exhausted.
 * This keeps the helper agnostic of each provider's per-endpoint cursor
 * envelope.
 * @public
 */
export const paginateActivity = (
  freshItems: ActivityItem[],
  overflow: ActivityItem[],
  params: Pick<
    ProviderGetActivityParams,
    'type' | 'startTime' | 'endTime' | 'limit'
  >,
  mintCursor: (overflowTail: ActivityItem[]) => string | undefined
): { items: ActivityItem[]; pagination: Pagination } => {
  const merged = [...overflow, ...freshItems]

  // The type filter also applies to replayed overflow rows: a cursor minted
  // under one filter must never leak another surface's rows when the caller
  // pages the two surfaces independently.
  const requestedTypes =
    params.type === undefined ? undefined : new Set(params.type)

  const filtered = merged.filter((it) => {
    if (requestedTypes !== undefined && !requestedTypes.has(it.type)) {
      return false
    }
    const ts = new Date(it.timestamp).getTime()
    if (params.startTime !== undefined && ts < params.startTime) {
      return false
    }
    if (params.endTime !== undefined && ts > params.endTime) {
      return false
    }
    return true
  })

  filtered.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  const limit = params.limit ?? filtered.length
  const items = filtered.slice(0, limit)
  const cursor = mintCursor(filtered.slice(limit))

  return {
    items,
    pagination: {
      limit,
      hasMore: cursor !== undefined,
      ...(cursor === undefined ? {} : { cursor }),
    },
  }
}
