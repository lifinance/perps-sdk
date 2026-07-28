import { PerpsErrorCode } from '@lifi/perps-types'

/**
 * Error thrown by every SDK code path — backend error responses, transport
 * failures, and SDK-side validation alike. Carries a {@link PerpsErrorCode}
 * for programmatic branching and an optional `tool` tag identifying the
 * originating package.
 *
 * @public
 */
export class PerpsError extends Error {
  /** Machine-readable error code for programmatic handling. */
  code: PerpsErrorCode
  /** Stable error name used by `instanceof`/logging. */
  override name = 'PerpsError'
  /** Originating package or provider key, when known. */
  tool?: string

  /**
   * Create an SDK error. Defaults to `DefaultError` and a generic message when
   * callers do not provide either value.
   */
  constructor(
    code: PerpsErrorCode = PerpsErrorCode.DefaultError,
    message = 'Unknown error occurred'
  ) {
    super(message)
    this.code = code
  }
}
