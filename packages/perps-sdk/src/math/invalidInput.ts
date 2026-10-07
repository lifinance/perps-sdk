import { PerpsErrorCode } from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'

/** A `ValidationError` that names the input parameter and the rule it breaks. */
export function invalidInput(parameter: string, rule: string): PerpsError {
  return new PerpsError(
    PerpsErrorCode.ValidationError,
    `\`${parameter}\` ${rule}.`
  )
}
