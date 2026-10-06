import type { DecimalString } from '@lifi/perps-types'
import Big from 'big.js'
import { validateDecimalString } from './parse.js'

/** Parse a decimal input after {@link validateDecimalString} accepts it. */
export function requireDecimal(value: DecimalString, field: string): Big {
  return new Big(validateDecimalString(value, field))
}
