import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { ONDO_PROVIDER_KEY } from '../constants.js'

/**
 * Exact-decimal parse of an Ondo wire decimal string. `field` names the
 * offending field on failure, so a venue contract breach surfaces as a
 * `PerpsError` instead of an anonymous big.js throw.
 *
 * @throws {PerpsError} `SDKError` when `value` is not a decimal numeric string.
 */
export const toWireBig = (value: string, field: string): Big => {
  try {
    return new Big(value)
  } catch {
    const error = new PerpsError(
      PerpsErrorCode.SDKError,
      `Ondo field \`${field}\` is not a valid decimal: '${value}'`
    )
    error.tool = ONDO_PROVIDER_KEY
    throw error
  }
}
