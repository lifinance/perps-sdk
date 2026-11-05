import type { ProviderId } from './primitives.js'

/** Category of a {@link Notice}. @public */
export type NoticeKind = 'info' | 'maintenance' | 'incident'

/** Lifecycle of the event a {@link Notice} describes. @public */
export type NoticeStatus = 'upcoming' | 'active' | 'resolved'

/** Impact level of a {@link Notice}. @public */
export type NoticeSeverity = 'info' | 'warning' | 'critical'

/** A provider component that an event affects. @public */
export interface NoticeAffectedComponent {
  /** Stable component identifier from the source feed. */
  id: string
  name: string
  /** Component status as the source feed reports it, not normalized. */
  status?: string
}

/** The external status-feed event that a {@link Notice} imports. @public */
export interface NoticeSource {
  eventId: string
  /** Public URL of the event on the source status page. */
  url: string
}

/**
 * A platform advisory served by `GET /v1/perps/meta`. Without `providerKeys`
 * it is global; with them it applies only to the listed providers. Fields
 * beyond `timestamp`, `title`, `message` and `link` are optional.
 * @public
 */
export interface Notice {
  /** Unix epoch milliseconds of publication or first discovery. Stable across polls. */
  timestamp: number
  title: string
  message: string
  /** Optional URL the notice links to; rendered as a hyperlink when present. */
  link?: string
  /** Stable notice identity across polls and revisions. */
  id?: string
  /** Opaque token that changes only when the user-facing content changes. Compare for equality only. */
  revision?: string
  /** Providers the notice applies to. Absent means a global notice; an imported notice lists at least one. */
  providerKeys?: ProviderId[]
  kind?: NoticeKind
  status?: NoticeStatus
  severity?: NoticeSeverity
  /**
   * Unix epoch milliseconds when the notice becomes visible, inclusive.
   * Absent means no lower bound. Visibility bounds do not describe a maintenance window.
   */
  validFrom?: number
  /**
   * Unix epoch milliseconds when the notice stops being visible, exclusive.
   * Absent means no upper bound.
   */
  validTo?: number
  /** Unix epoch milliseconds when the event starts. */
  startsAt?: number
  /**
   * Unix epoch milliseconds when the event is scheduled to end. A scheduled end
   * does not prove recovery; absent means the end is not known.
   */
  endsAt?: number
  /** Unix epoch milliseconds when the source confirmed the event resolved. */
  resolvedAt?: number
  affectedComponents?: NoticeAffectedComponent[]
  source?: NoticeSource
  /** Unix epoch milliseconds of the latest relevant update the source published. */
  sourceUpdatedAt?: number
  /** Unix epoch milliseconds of the last successful source observation, not the last poll attempt. */
  lastCheckedAt?: number
  /** `true` when the backend marks the source data as out of date. */
  sourceStale?: boolean
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
