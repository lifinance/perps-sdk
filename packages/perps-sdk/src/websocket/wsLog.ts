const MAX_PAYLOAD_CHARS = 512

const truncate = (raw: string): string =>
  raw.length > MAX_PAYLOAD_CHARS
    ? `${raw.slice(0, MAX_PAYLOAD_CHARS)}…(${raw.length} chars)`
    : raw

/**
 * Structured logger for WS message-handling and subscription failures, shared
 * by the provider packages so a malformed frame, a throwing mapper, or a failed
 * resubscribe never vanishes silently.
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
  /**
   * A channel's (re)subscribe threw while (re)opening the socket — e.g. an
   * auth-token fetch rejected after a reconnect. Surfaced at `error`; the
   * channel is skipped so one failure does not abort the others.
   */
  subscribeFailure(provider: string, channel: string, error: unknown): void {
    console.error(
      `[${provider}:ws] resubscribe failed for channel '${channel}'; it will not receive updates until the next reconnect.`,
      error
    )
  },
} as const
