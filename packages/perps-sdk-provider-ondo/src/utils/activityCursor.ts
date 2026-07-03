import { PerpsError } from '@lifi/perps-sdk'
import { type ActivityItem, PerpsErrorCode } from '@lifi/perps-types'

/**
 * Per-endpoint cursor envelope for Ondo activity pagination.
 *
 * Each key holds the `pageInfo.nextCursor` returned by that endpoint on the
 * previous call. When a key is **present** with a non-empty string the
 * corresponding endpoint will be re-fetched at that cursor on the next call;
 * when a key is **absent** the endpoint is treated as exhausted (or never
 * paged because the type filter excluded it) and skipped.
 *
 * The envelope is round-tripped through `cursor` as base64url JSON so callers
 * don't need to know the per-endpoint shape.
 * @public
 */
export interface OndoActivityCursor {
  fundings?: string
  liquidations?: string
  /**
   * Already-fetched, merged-and-sorted rows that did not fit under the page
   * `limit`. The upstream cursors above have advanced past these rows, so they
   * are replayed (prepended) on the next page before any fresh fetch — without
   * them the tail would be lost forever.
   */
  overflow?: ActivityItem[]
}

const CURSOR_KEYS = ['fundings', 'liquidations'] as const

const isNonEmpty = (v: string | undefined): v is string =>
  typeof v === 'string' && v.length > 0

/**
 * Encode an `OndoActivityCursor` as the base64url-of-JSON cursor string
 * persisted between activity pages. Returns `undefined` when every
 * per-endpoint key is empty and no `overflow` rows remain — the caller
 * should report `hasMore: false` and omit `cursor` from `Pagination` then.
 *
 * Browser-direct: `Buffer` is Node-only. We use `btoa` over a Latin-1
 * encoding of the UTF-8 bytes and then rewrite `+/=` to base64url. This is
 * the same byte sequence Node's `Buffer.from(json, 'utf8').toString('base64url')`
 * produces, so cursors round-trip across environments.
 * @public
 */
export const encodeActivityCursor = (
  env: OndoActivityCursor
): string | undefined => {
  const compact: OndoActivityCursor = {}
  for (const key of CURSOR_KEYS) {
    if (isNonEmpty(env[key])) {
      compact[key] = env[key]
    }
  }
  if (env.overflow !== undefined && env.overflow.length > 0) {
    compact.overflow = env.overflow
  }
  if (Object.keys(compact).length === 0) {
    return undefined
  }
  return toBase64Url(JSON.stringify(compact))
}

/**
 * Decode a previously-encoded activity cursor. Returns `undefined` for an
 * absent cursor (first page) and throws {@link PerpsError} with
 * `ValidationError` if the string is malformed — we'd rather fail loudly than
 * silently re-page from page 1 and re-deliver already-paginated rows.
 * @public
 */
export const decodeActivityCursor = (
  cursor: string | undefined
): OndoActivityCursor | undefined => {
  if (cursor === undefined) {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(cursor))
  } catch {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      'Invalid Ondo activity cursor: not base64url-encoded JSON'
    )
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      'Invalid Ondo activity cursor: expected JSON object'
    )
  }
  const cursorRecord = parsed as Record<string, unknown>
  const env: OndoActivityCursor = {}
  for (const key of CURSOR_KEYS) {
    const v = cursorRecord[key]
    if (v === undefined) {
      continue
    }
    if (typeof v !== 'string') {
      throw new PerpsError(
        PerpsErrorCode.ValidationError,
        `Invalid Ondo activity cursor: ${key} must be a string`
      )
    }
    env[key] = v
  }
  const overflow = cursorRecord.overflow
  if (overflow !== undefined) {
    if (!Array.isArray(overflow)) {
      throw new PerpsError(
        PerpsErrorCode.ValidationError,
        'Invalid Ondo activity cursor: overflow must be an array'
      )
    }
    env.overflow = overflow as ActivityItem[]
  }
  return env
}

const toBase64Url = (s: string): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf8').toString('base64url')
  }
  const utf8 = unescape(encodeURIComponent(s))
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (s: string): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'base64url').toString('utf8')
  }
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + padFor(s)
  const decoded = atob(padded)
  return decodeURIComponent(escape(decoded))
}

const padFor = (s: string): string => {
  const rem = s.length % 4
  return rem === 0 ? '' : '='.repeat(4 - rem)
}
