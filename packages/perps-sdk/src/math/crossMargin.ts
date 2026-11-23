import {
  type AccountMode,
  type CrossMarginHealth,
  CrossMarginHealthStatus,
  type CrossMarginPool,
  type DecimalString,
} from '@lifi/perps-types'
import { divideDecimalString } from '../decimal/arithmetic.js'
import { isDecimalStringGreaterThan } from '../decimal/compare.js'
import { isDecimalString } from '../decimal/parse.js'

/**
 * Inputs of {@link buildCrossMarginHealth}. A provider passes the venue
 * maintenance margin and equity of one pool, or `undefined` when the account
 * read lacks one.
 *
 * @public
 */
export interface CrossMarginHealthInput {
  mode: AccountMode
  pool: CrossMarginPool
  liquidationThreshold: DecimalString
  maintenanceMargin: DecimalString | undefined
  equity: DecimalString | undefined
}

/**
 * Classify one cross pool, then divide `maintenanceMargin ÷ equity` only for a
 * pool with exposure and positive equity. The division is exact to 40 decimal
 * places, half-up. A missing or malformed input gives `UNAVAILABLE`; the
 * helper never throws.
 *
 * @public
 */
export function buildCrossMarginHealth({
  mode,
  pool,
  liquidationThreshold,
  maintenanceMargin,
  equity,
}: CrossMarginHealthInput): CrossMarginHealth {
  const base = { mode, pool, liquidationThreshold }
  if (!(isDecimalString(maintenanceMargin) && isDecimalString(equity))) {
    return { ...base, status: CrossMarginHealthStatus.UNAVAILABLE }
  }
  if (!isDecimalStringGreaterThan(maintenanceMargin, '0')) {
    return { ...base, status: CrossMarginHealthStatus.NO_EXPOSURE }
  }
  if (!isDecimalStringGreaterThan(equity, '0')) {
    return { ...base, status: CrossMarginHealthStatus.NON_POSITIVE_EQUITY }
  }
  return {
    ...base,
    status: CrossMarginHealthStatus.MEASURED,
    ratio: divideDecimalString(maintenanceMargin, equity),
  }
}
