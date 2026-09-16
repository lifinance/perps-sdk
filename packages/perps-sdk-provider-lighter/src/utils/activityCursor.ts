import { PerpsError } from '@lifi/perps-sdk'
import {
  type ActivityItem,
  ActivityType,
  PerpsErrorCode,
} from '@lifi/perps-types'

/**
 * Endpoint-keyed activity cursor; absent endpoints are exhausted or excluded.
 * Nonempty overflow requires a version-2 base64url JSON envelope.
 * @public
 */
export interface LighterActivityCursor {
  deposits?: string
  withdraws?: string
  fundings?: string
  liquidations?: string
  transfers?: string
  /**
   * Already-fetched, merged-and-sorted rows that did not fit under the page
   * `limit`. The upstream cursors above have advanced past these rows, so they
   * are replayed (prepended) on the next page before any fresh fetch — without
   * them the tail would be lost forever.
   */
  overflow?: ActivityItem[]
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
 * every per-endpoint key is empty and no `overflow` rows remain — the caller
 * should report `hasMore: false` and omit `cursor` from `Pagination` then.
 *
 * The codec uses `btoa`/`atob` only. A browser `Buffer` polyfill may lack the
 * `base64url` encoding, so the Node `Buffer` API is never consulted.
 * @public
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
  if (env.overflow !== undefined && env.overflow.length > 0) {
    compact.overflow = env.overflow
  }
  if (Object.keys(compact).length === 0) {
    return undefined
  }
  return toBase64Url(JSON.stringify({ version: 2, ...compact }))
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
  const cursorRecord = parsed as Record<string, unknown>
  const env: LighterActivityCursor = {}
  for (const key of CURSOR_KEYS) {
    const v = cursorRecord[key]
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
  const overflow = cursorRecord.overflow
  if (overflow !== undefined) {
    if (!Array.isArray(overflow)) {
      throw new PerpsError(
        PerpsErrorCode.ValidationError,
        'Invalid Lighter activity cursor: overflow must be an array'
      )
    }
    if (overflow.length > 0 && cursorRecord.version !== 2) {
      throw new PerpsError(
        PerpsErrorCode.ValidationError,
        'Invalid Lighter activity cursor: legacy overflow format; restart pagination'
      )
    }
    env.overflow = overflow.map(toOverflowItem)
  }
  return env
}

const ACTIVITY_TYPES: readonly string[] = Object.values(ActivityType)

/**
 * A cursor travels through consumer storage, so an overflow row may arrive
 * corrupted or from an incompatible build. Reject it here rather than let a
 * malformed row reach a consumer as a typed activity.
 */
const toOverflowItem = (row: unknown, index: number): ActivityItem => {
  const invalid = (detail: string): PerpsError =>
    new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid Lighter activity cursor: overflow[${index}] ${detail}`
    )
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    throw invalid('must be an object')
  }
  const item = row as Record<string, unknown>
  for (const field of ['id', 'provider', 'timestamp'] as const) {
    if (typeof item[field] !== 'string') {
      throw invalid(`${field} must be a string`)
    }
  }
  if (typeof item.type !== 'string' || !ACTIVITY_TYPES.includes(item.type)) {
    throw invalid('carries an unknown activity type')
  }
  return row as ActivityItem
}

const toBase64Url = (s: string): string => {
  let binary = ''
  for (const byte of new TextEncoder().encode(s)) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (s: string): string => {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + padFor(s)
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const padFor = (s: string): string => {
  const rem = s.length % 4
  return rem === 0 ? '' : '='.repeat(4 - rem)
}
