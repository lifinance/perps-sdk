import type { DecimalString } from '@lifi/perps-types'
import { requireProvider } from '../client/requireProvider.js'
import {
  compareDecimalStrings,
  isDecimalStringGreaterThan,
} from '../decimal/compare.js'
import { invalidInput } from '../errors/invalidInput.js'
import type { PerpsSDKClient } from '../types/provider.js'
import { createSafeFunction } from '../utils/createSafeFunction.js'

/** Compare leverage under the provider's storage rules, or exactly when it has no quantization rule. @public */
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
  return plugin.isLeverageEqual
    ? plugin.isLeverageEqual(requested, reported)
    : compareDecimalStrings(requested, reported) === 0
}

/** Return no comparison and log a warning when {@link isLeverageEqual} throws. @public */
export const safeIsLeverageEqual = createSafeFunction(
  'isLeverageEqual',
  isLeverageEqual
)
