/**
 * Structured logger for client-layer (non-WebSocket) diagnostics, the REST-side
 * counterpart to {@link wsLog}, so failures surface through a single named
 * channel rather than scattered `console` calls.
 *
 * @internal
 */
export const clientLog = {
  /**
   * The backend bookkeeping submission rejected after the venue call already
   * landed. Surfaced at `error` and swallowed by the caller — a failed
   * mirror-write must never mask an order that already executed on the venue.
   */
  bookkeepingFailure(provider: string, error: unknown): void {
    console.error(
      `[${provider}] backend bookkeeping submission failed after venue execution`,
      error
    )
  },
} as const
