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
  code: PerpsErrorCode
  override name = 'PerpsError'
  tool?: string

  constructor(
    code: PerpsErrorCode = PerpsErrorCode.DefaultError,
    message = 'Unknown error occurred'
  ) {
    super(message)
    this.code = code
  }
}
