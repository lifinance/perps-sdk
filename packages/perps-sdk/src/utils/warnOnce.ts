/**
 * The number of keys one warner remembers. Venue wire data supplies the keys,
 * so the memory must not grow for as long as the process runs.
 */
const KEY_MEMORY_LIMIT = 256

/**
 * Build a warner that writes each distinct key once. The warner forgets the
 * oldest key when its memory is full, so a key it saw long ago can warn a
 * second time.
 *
 * @internal
 */
export const createWarnOnce = (): ((key: string, message: string) => void) => {
  const seen = new Set<string>()
  return (key, message) => {
    if (seen.has(key)) {
      return
    }
    if (seen.size >= KEY_MEMORY_LIMIT) {
      const oldest = seen.values().next().value
      if (oldest !== undefined) {
        seen.delete(oldest)
      }
    }
    seen.add(key)
    console.warn(message)
  }
}
