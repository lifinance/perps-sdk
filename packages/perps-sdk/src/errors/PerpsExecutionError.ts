import {
  type ActionResult,
  type ExecuteActionResponse,
  PerpsErrorCode,
} from '@lifi/perps-types'
import { PerpsError } from './PerpsError.js'

/**
 * Error thrown when an execution stage fails after part of the execution
 * report is known. `response` holds every result known at the failure, and
 * `cause` holds the original error. Its `code` is the cause's code when the
 * cause is a {@link PerpsError}, else `SDKError`.
 *
 * @public
 */
export class PerpsExecutionError extends PerpsError {
  override name = 'PerpsExecutionError'
  readonly response: ExecuteActionResponse

  constructor(response: ExecuteActionResponse, cause: unknown) {
    super(
      cause instanceof PerpsError ? cause.code : PerpsErrorCode.SDKError,
      cause instanceof Error ? cause.message : String(cause)
    )
    this.response = response
    this.cause = cause
  }
}

/**
 * Rethrow `error` unchanged when `known` is empty. Otherwise throw a
 * {@link PerpsExecutionError} whose report holds `known`, then any results
 * `error` already carries.
 *
 * @public
 */
export function rethrowWithKnownResults(
  known: ActionResult[],
  error: unknown
): never {
  if (known.length === 0) {
    throw error
  }
  if (error instanceof PerpsExecutionError) {
    throw new PerpsExecutionError(
      { results: [...known, ...error.response.results] },
      error.cause
    )
  }
  throw new PerpsExecutionError({ results: known }, error)
}
