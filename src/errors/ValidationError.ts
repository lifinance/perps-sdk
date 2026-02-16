import { PerpsErrorCode } from '@lifi/perps-types'
import { version } from '../version.js'
import { PerpsErrorName } from './constants.js'
import { PerpsError } from './PerpsError.js'

/**
 * Error thrown when validation fails (invalid parameters, missing required fields, etc.)
 */
export class ValidationError extends PerpsError {
  override name = PerpsErrorName.ValidationError

  constructor(message: string) {
    super(PerpsErrorCode.ValidationError, message)
    this.name = PerpsErrorName.ValidationError

    // Override message format
    this.message = `[${PerpsErrorName.ValidationError}] ${message}\nLI.FI Perps SDK version: ${version}`
  }

  /**
   * Create a ValidationError from a validation failure.
   *
   * @param field - The field that failed validation
   * @param reason - The reason for validation failure
   */
  static field(field: string, reason: string): ValidationError {
    return new ValidationError(`Invalid ${field}: ${reason}`)
  }

  /**
   * Create a ValidationError for a missing required field.
   *
   * @param field - The name of the missing field
   */
  static required(field: string): ValidationError {
    return new ValidationError(`${field} is required`)
  }
}
