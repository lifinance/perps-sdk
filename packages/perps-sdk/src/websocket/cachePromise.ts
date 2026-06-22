/**
 * Single-flight a promise through a caller-owned cache slot, evicting the
 * cached promise if it rejects so the next call retries cleanly.
 *
 * Concurrent callers share the one in-flight promise; the rejection still
 * propagates to every awaiter that triggered it. Only a settled rejection is
 * evicted — a resolved promise stays cached.
 *
 * @param read - Returns the currently cached promise, or `undefined` if none.
 * @param write - Stores (or with `undefined`, clears) the cached promise.
 * @param factory - Creates the promise when the slot is empty.
 */
export function cachePromise<T>(
  read: () => Promise<T> | undefined,
  write: (promise: Promise<T> | undefined) => void,
  factory: () => Promise<T>
): Promise<T> {
  const cached = read()
  if (cached) {
    return cached
  }
  const promise = factory()
  promise.catch(() => {
    if (read() === promise) {
      write(undefined)
    }
  })
  write(promise)
  return promise
}
