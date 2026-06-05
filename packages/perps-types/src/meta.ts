/**
 * A single platform-level advisory shown to all users, independent of any
 * provider or market.
 * @public
 */
export interface PerpsNotice {
  /** Unix epoch milliseconds. */
  timestamp: number
  title: string
  message: string
  /** Optional URL the notice links to; rendered as a hyperlink when present. */
  link?: string
}

/**
 * Read-only platform metadata served by `GET /v1/perps/meta`.
 * @public
 */
export interface PerpsMeta {
  version: string
  notices: PerpsNotice[]
}
