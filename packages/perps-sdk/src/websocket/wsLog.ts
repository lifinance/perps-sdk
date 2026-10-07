import {
  createWarnOnce,
  cutVenueText,
  skippedRowMessage,
} from '../utils/warnOnce.js'

const MAX_PAYLOAD_CHARS = 512

const truncate = (raw: string): string =>
  raw.length > MAX_PAYLOAD_CHARS
    ? `${raw.slice(0, MAX_PAYLOAD_CHARS)}…(${raw.length} chars)`
    : raw

const warnSkippedRowOnce = createWarnOnce()

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
   * An `error`-channel frame the server pushed (e.g. a rejected or duplicate
   * subscription). The frame parsed fine — this is the venue reporting a
   * problem, not a malformed frame — so surface it at `error` with the
   * server's own text rather than mislabelling it a parse failure.
   */
  serverError(provider: string, message: string): void {
    console.error(`[${provider}:ws] server error`, message)
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
  /**
   * A frame item referenced a market id missing from the registry (e.g.
   * listed after the snapshot). The item is skipped — never the whole frame —
   * so logged at `warn`.
   */
  unknownMarket(provider: string, marketId: string): void {
    console.warn(
      `[${provider}:ws] skipping item for unknown market '${marketId}'`
    )
  },
  /**
   * A frame row or order-book level with a required field that is not valid.
   * Only that row is skipped. Logged once at `warn` for each provider, row,
   * field and market; the key holds no venue value.
   */
  skippedRow(
    provider: string,
    row: string,
    field: string,
    value: unknown,
    marketId?: string
  ): void {
    warnSkippedRowOnce(
      `${provider}|${row}|${field}|${marketId ?? ''}`,
      skippedRowMessage(
        `${provider}:ws`,
        row,
        field,
        value,
        'decimal',
        marketId
      )
    )
  },
  /**
   * A frame row the mapper rejected for a reason other than one field, such as
   * a lifecycle state the SDK does not carry. Logged once at `warn` for each
   * provider, row and reason; the reason is cut to a fixed length.
   */
  droppedRow(provider: string, row: string, reason: string): void {
    const shown = cutVenueText(reason)
    warnSkippedRowOnce(
      `${provider}|${row}|dropped|${shown}`,
      `[${provider}:ws] skipping ${row} row: ${shown}`
    )
  },
  /**
   * A background market-registry refetch rejected. Unknown-market items keep
   * being skipped until the next cooldown-gated retry, so logged at `warn`.
   */
  marketRefreshFailure(provider: string, error: unknown): void {
    console.warn(`[${provider}:ws] market registry refresh failed`, error)
  },
  /**
   * A consumer listener callback threw during fan-out. Logged and skipped so
   * one bad listener cannot starve sibling listeners or break socket flow.
   */
  listenerFailure(
    provider: string,
    listenerType: string,
    error: unknown
  ): void {
    console.error(
      `[${provider}:ws] listener threw during '${listenerType}' fan-out`,
      error
    )
  },
} as const
