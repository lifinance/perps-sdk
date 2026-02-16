import { PerpsErrorCode } from '@lifi/perps-types'
import { version } from '../version.js'
import { PerpsErrorName } from './constants.js'

export class PerpsError extends Error {
  code: PerpsErrorCode
  override name = PerpsErrorName.PerpsError

  constructor(
    code: PerpsErrorCode = PerpsErrorCode.DefaultError,
    message = 'Unknown error occurred'
  ) {
    const errorMessage = `[${PerpsErrorName.PerpsError}] ${message}\nLI.FI Perps SDK version: ${version}`
    super(errorMessage)
    this.code = code
    this.name = PerpsErrorName.PerpsError
  }

  static fromError(error: unknown, defaultCode?: PerpsErrorCode): PerpsError {
    if (error instanceof PerpsError) {
      return error
    }
    if (error instanceof Error) {
      return new PerpsError(
        defaultCode ?? PerpsErrorCode.DefaultError,
        error.message
      )
    }
    return new PerpsError(
      defaultCode ?? PerpsErrorCode.DefaultError,
      String(error)
    )
  }
}
