/**
 * A single platform-level advisory shown to all users, independent of any
 * provider or market.
 * @public
 */
export interface Notice {
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
export interface Meta {
  version: string
  notices: Notice[]
}

/**
 * Current Terms-of-Service and this address's acceptance, served by
 * `GET /v1/perps/meta/terms?address=`.
 * @public
 */
export interface TermsAcceptanceStatus {
  /** Backend-owned version identifier for the current terms. */
  termsVersion: string
  /** Full current terms-of-service text. */
  content: string
  /** Whether the queried address has accepted {@link TermsAcceptanceStatus.termsVersion}. */
  accepted: boolean
  /** Unix epoch milliseconds the address accepted; absent when not accepted. */
  acceptedAt?: number
}
