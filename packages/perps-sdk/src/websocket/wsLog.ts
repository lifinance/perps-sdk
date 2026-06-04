const MAX_PAYLOAD_CHARS = 512

const truncate = (raw: string): string =>
  raw.length > MAX_PAYLOAD_CHARS
    ? `${raw.slice(0, MAX_PAYLOAD_CHARS)}…(${raw.length} chars)`
    : raw

/**
 * Structured logger for WS message-handling failures, shared by the provider
 * packages so a malformed frame or a throwing mapper never vanishes silently.
 *
 * @internal
 */
export const wsLog = {
  /**
   * A single frame that could not be parsed as JSON. Expected to recur on a
   * noisy stream, so logged at `warn` with a truncated payload — never fatal.
   */
  parseFailure(provider: string, raw: string): void {
    console.warn(`[${provider}:ws] dropping unparseable frame`, truncate(raw))
  },
  /**
   * A frame parsed but its handler threw (mapper bug, `MarketNotFound`, …).
   * This is unexpected and must surface; the frame is skipped so one bad
   * frame does not stall the stream or starve other channels.
   */
  handlerFailure(provider: string, error: unknown): void {
    console.error(`[${provider}:ws] message handler threw`, error)
  },
} as const
