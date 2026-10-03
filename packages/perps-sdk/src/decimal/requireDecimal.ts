import type { DecimalString } from '@lifi/perps-types'
import Big from 'big.js'
import { validateDecimal } from './parse.js'

/** Parse a decimal input after {@link validateDecimal} accepts it. */
export function requireDecimal(value: DecimalString, field: string): Big {
  return new Big(validateDecimal(value, field))
}
