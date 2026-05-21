import { PerpsErrorCode } from '@lifi/perps-types'

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
