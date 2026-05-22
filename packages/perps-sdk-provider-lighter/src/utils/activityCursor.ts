import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'

/**
 * Per-endpoint cursor envelope for Lighter activity pagination.
 *
 * Each key holds the upstream `cursor` / `next_cursor` returned by that
 * endpoint on the previous call. When a key is **present** with a non-empty
 * string the corresponding endpoint will be re-fetched at that cursor on the
 * next call; when a key is **absent** the endpoint is treated as exhausted
 * (or never paged because the type filter excluded it) and skipped.
 *
 * The envelope is round-tripped through `cursor` as base64url JSON so callers
 * don't need to know the per-endpoint shape. The encoding mirrors what the
 * LI.FI backend has emitted to widget consumers since the multi-endpoint
 * activity fan-out landed; the SDK preserves the same shape so cursors
 * minted by the old backend path remain usable post-migration.
 */
export interface LighterActivityCursor {
  deposits?: string
  withdraws?: string
  fundings?: string
  liquidations?: string
  transfers?: string
}

const CURSOR_KEYS = [
  'deposits',
  'withdraws',
  'fundings',
  'liquidations',
  'transfers',
] as const

const isNonEmpty = (v: string | undefined): v is string =>
  typeof v === 'string' && v.length > 0

/**
 * Encode a `LighterActivityCursor` as the base64url-of-JSON cursor string
 * Lighter widgets persist between activity pages. Returns `undefined` when
 * every key is empty — the caller should report `hasMore: false` and omit
 * `cursor` from `Pagination` in that case.
 *
 * Browser-direct: `Buffer` is Node-only. We use `btoa` over a Latin-1
 * encoding of the UTF-8 bytes and then rewrite `+/=` to base64url. This is
 * the same byte sequence Node's `Buffer.from(json, 'utf8').toString('base64url')`
 * produces, so cursors round-trip across environments.
 */
export const encodeActivityCursor = (
  env: LighterActivityCursor
): string | undefined => {
  const compact: LighterActivityCursor = {}
  for (const key of CURSOR_KEYS) {
    if (isNonEmpty(env[key])) {
      compact[key] = env[key]
    }
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
 */
export const decodeActivityCursor = (
  cursor: string | undefined
): LighterActivityCursor | undefined => {
  if (cursor === undefined) {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(cursor))
  } catch {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      'Invalid Lighter activity cursor: not base64url-encoded JSON'
    )
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      'Invalid Lighter activity cursor: expected JSON object'
    )
  }
  const obj = parsed as Record<string, unknown>
  const env: LighterActivityCursor = {}
  for (const key of CURSOR_KEYS) {
    const v = obj[key]
    if (v === undefined) {
      continue
    }
    if (typeof v !== 'string') {
      throw new PerpsError(
        PerpsErrorCode.ValidationError,
        `Invalid Lighter activity cursor: ${key} must be a string`
      )
    }
    env[key] = v
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
