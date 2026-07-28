import type { StorageAdapter } from './types.js'

/**
 * Parse a persisted (browser-writable) JSON record and validate it against a
 * caller-supplied shape guard. localStorage is user-writable, so a stored value
 * may be truncated, hand-edited, or written by an older schema; `JSON.parse(...)
 * as T` would type-check such a record yet carry missing/invalid fields that
 * fail far from here.
 *
 * Returns the parsed value when `isValid` accepts it; returns `null` when the
 * record is absent, unparseable, or fails validation (i.e. poisoned). A `null`
 * result is the "malformed-or-absent" signal — callers decide whether that
 * means "regenerate deliberately" or "surface an error", but they never get a
 * structurally-invalid `T`.
 *
 * @param raw Stored string, or `null` when the key is absent.
 * @param isValid Shape guard run against the parsed value.
 *
 * @public
 */
export function parseStoredRecord<T>(
  raw: string | null,
  isValid: (value: unknown) => value is T
): T | null {
  if (raw === null) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  return isValid(parsed) ? parsed : null
}

/**
 * Read and validate a persisted record in one step, evicting the key when the
 * stored value is present but poisoned (unparseable or failing `isValid`) so a
 * later read does not keep tripping over the same corrupt entry.
 *
 * Returns `null` for both the genuine-absence and the evicted-poison cases;
 * callers that must distinguish them should compare against the pre-read
 * presence of the key themselves.
 *
 * @public
 */
export async function readValidatedRecord<T>(
  storage: StorageAdapter,
  key: string,
  isValid: (value: unknown) => value is T
): Promise<T | null> {
  const raw = await storage.get(key)
  const parsed = parseStoredRecord(raw, isValid)
  if (parsed === null && raw !== null) {
    await storage.remove(key)
  }
  return parsed
}
