import { safeDivideDecimalString } from '@lifi/perps-sdk'

const PERCENT_PER_WHOLE = '100'

/**
 * Convert a Lighter funding rate, which the venue publishes in percent
 * (`'0.0012'` is 0.0012 %), to the decimal fraction the SDK funding fields
 * carry (`'0.000012'`). `undefined` with a warning when `percent` does not
 * match the decimal pattern.
 */
export const fundingPercentToFraction = (percent: string): string | undefined =>
  safeDivideDecimalString(percent, PERCENT_PER_WHOLE)
