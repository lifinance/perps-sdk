import type { DecimalString } from '@lifi/perps-types'
import { requireProvider } from '../client/requireProvider.js'
import { isDecimalStringGreaterThan } from '../decimal/compare.js'
import { invalidInput } from '../errors/invalidInput.js'
import type { PerpsSDKClient } from '../types/provider.js'
import { createSafeFunction } from '../utils/createSafeFunction.js'

/**
 * Compare leverage under the registered provider's storage rules.
 * @throws {PerpsError} `ValidationError` for invalid, non-positive, or provider-unsupported leverage; `SDKError` for an unregistered provider.
 * @public
 */
export function isLeverageEqual(
  sdk: PerpsSDKClient,
  provider: string,
  requested: DecimalString,
  reported: DecimalString
): boolean {
  const plugin = requireProvider(sdk, provider)
  if (!isDecimalStringGreaterThan(requested, '0')) {
    throw invalidInput('requested', 'leverage must be above zero')
  }
  if (!isDecimalStringGreaterThan(reported, '0')) {
    throw invalidInput('reported', 'leverage must be above zero')
  }
  return plugin.isLeverageEqual(requested, reported)
}

/** Return no comparison and log a warning when {@link isLeverageEqual} throws. @public */
export const safeIsLeverageEqual = createSafeFunction(
  'isLeverageEqual',
  isLeverageEqual
)
