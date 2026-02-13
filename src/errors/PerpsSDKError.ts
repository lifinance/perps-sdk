import { PerpsErrorCode } from '../types/perps.js'
import { version } from '../version.js'
import { PerpsError } from './PerpsError.js'

const PERPS_SDK_ERROR_NAME = 'PerpsSDKError'

/**
 * Top-level SDK error that wraps all other error types.
 * This is the public-facing error type for the SDK.
 *
 * PerpsSDKError always includes:
 * - A consistent error message format with SDK version
 * - Access to the root cause error via the `cause` property
 * - Stack trace preservation
 *
 * @example
 * ```ts
 * try {
 *   await getDexes(client)
 * } catch (error) {
 *   if (error instanceof PerpsSDKError) {
 *     console.log(error.message) // [PerpsSDKError] message\nSDK version: X
 *     console.log(error.cause)   // Original error
 *     console.log(error.code)    // Numeric error code
 *   }
 * }
 * ```
 */
export class PerpsSDKError extends Error {
  override name = PERPS_SDK_ERROR_NAME

  /** Numeric error code from PerpsErrorCode enum */
  code: PerpsErrorCode

  /** Original cause of the error */
  override cause?: Error

  constructor(error: Error, message?: string) {
    // Determine the code
    const code =
      error instanceof PerpsError ? error.code : PerpsErrorCode.DefaultError

    // Build the message
    const errorMessage = message ?? error.message
    const formattedMessage = `[${PERPS_SDK_ERROR_NAME}] ${errorMessage}\nLI.FI Perps SDK version: ${version}`

    super(formattedMessage)

    this.name = PERPS_SDK_ERROR_NAME
    this.code = code
    this.cause = error

    // Preserve the original stack trace if available
    if (error.stack) {
      this.stack = `${this.stack}\nCaused by: ${error.stack}`
    }
  }

  /**
   * Wrap any error in a PerpsSDKError.
   *
   * @param error - The error to wrap
   * @param message - Optional custom message
   * @returns PerpsSDKError instance
   */
  static wrap(error: unknown, message?: string): PerpsSDKError {
    if (error instanceof PerpsSDKError) {
      return error
    }

    if (error instanceof Error) {
      return new PerpsSDKError(error, message)
    }

    // Convert non-Error to Error
    const wrappedError = new Error(String(error))
    return new PerpsSDKError(wrappedError, message)
  }
}
