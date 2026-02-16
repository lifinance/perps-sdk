import { PerpsErrorCode } from '@lifi/perps-types'
import { version } from '../version.js'
import { PerpsErrorName } from './constants.js'
import { PerpsError } from './PerpsError.js'

/**
 * Error thrown when server-side operations fail (network errors, timeouts, etc.)
 */
export class ServerError extends PerpsError {
  override name = PerpsErrorName.ServerError

  constructor(message: string, code = PerpsErrorCode.ServerError) {
    super(code, message)
    this.name = PerpsErrorName.ServerError

    // Override message format
    this.message = `[${PerpsErrorName.ServerError}] ${message}\nLI.FI Perps SDK version: ${version}`
  }

  /**
   * Create a ServerError for a network failure.
   *
   * @param cause - The original error
   */
  static networkError(cause?: Error): ServerError {
    const message = cause?.message ?? 'Network request failed'
    return new ServerError(message)
  }

  /**
   * Create a ServerError for a timeout.
   *
   * @param operation - The operation that timed out
   */
  static timeout(operation: string): ServerError {
    return new ServerError(
      `${operation} timed out`,
      PerpsErrorCode.TimeoutError
    )
  }
}
