import type { DecimalString } from '@lifi/perps-types'
import {
  divideDecimalString,
  multiplyDecimalString,
} from '../decimal/arithmetic.js'
import { numberToDecimalString } from '../decimal/convert.js'
import { invalidInput } from '../errors/invalidInput.js'
import { createSafeFunction } from '../utils/createSafeFunction.js'

const SECONDS_PER_YEAR = String(365 * 24 * 60 * 60)

/**
 * Simple APR of a funding rate: `rate × (365 days in seconds ÷ ratePeriodSeconds)`,
 * as a signed fraction. It does not compound.
 *
 * @param rate - Funding rate as a fraction for one rate period, for example
 *   `MarketContext.funding.rate` or a settled funding average.
 * @param ratePeriodSeconds - `Provider.funding.ratePeriodSeconds`.
 * @throws {PerpsError} `ValidationError` when `rate` does not match the
 *   decimal pattern, or `ratePeriodSeconds` is not a finite number above zero.
 * @public
 */
export function annualizeFundingRate(
  rate: DecimalString,
  ratePeriodSeconds: number
): DecimalString {
  if (!Number.isFinite(ratePeriodSeconds) || ratePeriodSeconds <= 0) {
    throw invalidInput(
      'ratePeriodSeconds',
      `must be a finite number above zero, got ${ratePeriodSeconds}`
    )
  }
  return divideDecimalString(
    multiplyDecimalString(rate, SECONDS_PER_YEAR),
    numberToDecimalString(ratePeriodSeconds)
  )
}

/** @public */
export const safeAnnualizeFundingRate = createSafeFunction(
  'annualizeFundingRate',
  annualizeFundingRate
)
