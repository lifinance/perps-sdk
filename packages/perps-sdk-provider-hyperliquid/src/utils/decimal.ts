import { numberToDecimalString, PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'

/**
 * Exact-decimal parse of a Hyperliquid wire decimal string. `field` names the
 * offending field on failure, so a venue contract breach is diagnosable
 * instead of surfacing as an anonymous big.js throw or an `NaN` unit.
 *
 * @throws {PerpsError} `SDKError` when `value` is not a decimal numeric string.
 */
export const toWireBig = (value: string, field: string): Big => {
  try {
    return new Big(value)
  } catch {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Hyperliquid field \`${field}\` is not a valid decimal: '${value}'`
    )
  }
}

/**
 * Decimal string for a Hyperliquid context field that the venue sends as a
 * string or a number. Any other value is absent.
 */
export const toMarketContextString = (value: unknown): string | undefined => {
  if (typeof value === 'number') {
    return numberToDecimalString(value)
  }
  return typeof value === 'string' ? value : undefined
}
